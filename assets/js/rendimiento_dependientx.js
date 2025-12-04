document.addEventListener('DOMContentLoaded', async () => {
  const $ = (id) => document.getElementById(id);

  const fechaInput             = $('fechaInput');
  const sucursalTablasSelect   = $('sucursalTablasSelect');
  const btnHoy                 = $('btnHoy');
  const btnCorteMes            = $('btnCorteMes');

  const sucursalInput          = $('sucursalInput');
  const dependienteInput       = $('dependienteInput');
  const montoInput             = $('montoInput');
  const notaInput              = $('notaInput');
  const btnAgregar             = $('btnAgregar');

  const dependienteEstadoCuenta = $('dependienteEstadoCuenta');
  const btnEstadoCuenta         = $('btnEstadoCuenta');

  const resumenSucursalesContainer = $('resumenSucursalesContainer');
  const tbodyDependientesAcumulado = $('tbodyDependientesAcumulado');

  const tbodyRegistrosDia      = $('tbodyRegistrosDia');
  const ventaDiariaTotalSpan   = $('ventaDiariaTotal');
  const ventaAcumuladaTotalSpan= $('ventaAcumuladaTotal');
  const lastSavedBadge         = $('lastSaved');

  const RENDIMIENTO_BIN_ID = '691cce12d0ea881f40f0a29a';

  let config = {
    dependientes: [],
    sucursales: [],
    metasSucursal: {},
    metaPersonal: 0
  };

  let registros = [];
  let lastUpdateISO = null;
  let ultimoCorte = null;
  let metasUltimoCorte = null;
  let diasConRegistros = new Set();
  let fpInstance = null;

  // ==== Utilidades ====

  function hoyISO() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function parseISODate(str) {
    if (!str) return null;
    const d = new Date(str);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function parseMonto(v) {
    if (v === null || v === undefined) return 0;
    if (typeof v === 'number') return v;
    const num = parseFloat(String(v).replace(/[^0-9.,-]/g, '').replace(',', '.'));
    return Number.isNaN(num) ? 0 : num;
  }

  function formatMoney(num) {
    return num.toLocaleString('es-SV', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function ultimoDiaMes(baseDate) {
    const y = baseDate.getFullYear();
    const m = baseDate.getMonth(); // 0-11
    return new Date(y, m + 1, 0);
  }

  function actualizarLastSaved() {
    lastSavedBadge.innerHTML =
      '<i class="fa-solid fa-clock-rotate-left me-1"></i>' +
      (lastUpdateISO ? ('Última actualización: ' + formatSV(lastUpdateISO)) : 'Aún no guardado.');
  }

  function esRegistroVigente(r){
    if (!r || !r.fecha) return false;

    const fechaSel = (typeof fechaInput !== 'undefined' && fechaInput && fechaInput.value)
      ? fechaInput.value
      : '';

    // Si nunca se ha hecho corte
    if (!ultimoCorte){
      // Si no hay fecha seleccionada, cuenta todo
      if (!fechaSel) return true;
      // Si hay fecha seleccionada, cuenta todo hasta esa fecha
      return r.fecha <= fechaSel;
    }

    // Con corte definido
    if (!fechaSel){
      // Sin fecha seleccionada: consideramos sólo registros posteriores al corte
      return r.fecha > ultimoCorte;
    }

    if (fechaSel <= ultimoCorte){
      // Estamos consultando una fecha en el periodo ANTES del corte:
      // se comporta como si no existiera corte, acumulando hasta esa fecha
      return r.fecha <= fechaSel;
    } else {
      // Estamos consultando una fecha DESPUÉS del corte:
      // sólo importa lo posterior al corte y hasta la fecha seleccionada
      if (r.fecha <= ultimoCorte) return false;
      return r.fecha <= fechaSel;
    }
  }

  function getMetasContextuales(){
    const fechaSel = (typeof fechaInput !== 'undefined' && fechaInput && fechaInput.value)
      ? fechaInput.value
      : '';

    // Si no hay corte o no hay snapshot, usamos siempre las metas actuales
    if (!ultimoCorte || !metasUltimoCorte){
      return {
        metasSucursal: config.metasSucursal,
        metaPersonal: config.metaPersonal
      };
    }

    // Si no hay fecha seleccionada, asumimos contexto actual (después del corte)
    if (!fechaSel){
      return {
        metasSucursal: config.metasSucursal,
        metaPersonal: config.metaPersonal
      };
    }

    if (fechaSel <= ultimoCorte){
      // Consultando histórico antes (o en) el corte: usamos las metas del momento del corte
      return {
        metasSucursal: metasUltimoCorte.metasSucursal || config.metasSucursal,
        metaPersonal: (metasUltimoCorte.metaPersonal ?? config.metaPersonal)
      };
    }

    // Consultando fechas posteriores al corte: usamos metas actuales
    return {
      metasSucursal: config.metasSucursal,
      metaPersonal: config.metaPersonal
    };
  }

  function recomputarDiasConRegistros() {
    const set = new Set();
    registros.forEach(r => {
      if (r.fecha) set.add(r.fecha);
    });
    diasConRegistros = set;
    if (fpInstance) {
      fpInstance.redraw();
    }
  }

  // ==== Carga de configuración desde Google Sheets ====

  async function cargarConfig() {
    const resp = await fetch('/api/rendimiento-config');
    if (!resp.ok) {
      throw new Error('No se pudo cargar configuración de rendimiento.');
    }
    const data = await resp.json();
    config.dependientes  = Array.isArray(data.dependientes) ? data.dependientes : [];
    config.sucursales    = Array.isArray(data.sucursales) ? data.sucursales : [];
    config.metasSucursal = data.metasSucursal || {};
    config.metaPersonal  = data.metaPersonal || 0;
  }

  function poblarSelects() {
    // Sucursales
    sucursalInput.innerHTML = '';
    sucursalTablasSelect.innerHTML = '';

    config.sucursales.forEach(suc => {
      const opt1 = document.createElement('option');
      opt1.value = suc;
      opt1.textContent = suc;
      sucursalInput.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = suc;
      opt2.textContent = suc;
      sucursalTablasSelect.appendChild(opt2);
    });

    // Dependientes
    dependienteInput.innerHTML = '';
    dependienteEstadoCuenta.innerHTML = '';

    config.dependientes.forEach(dep => {
      const opt1 = document.createElement('option');
      opt1.value = dep;
      opt1.textContent = dep;
      dependienteInput.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = dep;
      opt2.textContent = dep;
      dependienteEstadoCuenta.appendChild(opt2);
    });
  }

  // ==== Carga / guardado en JSONBin ====

  async function cargarRegistros() {
    const rec = await loadFromBin(RENDIMIENTO_BIN_ID);
    if (rec && Array.isArray(rec.registros)) {
      registros        = rec.registros;
      lastUpdateISO    = rec.meta?.updatedAt || null;
      ultimoCorte      = rec.meta?.ultimoCorte || null;
      metasUltimoCorte = rec.meta?.metasUltimoCorte || null;
    } else {
      registros        = [];
      lastUpdateISO    = null;
      ultimoCorte      = null;
      metasUltimoCorte = null;
    }
    actualizarLastSaved();
    recomputarDiasConRegistros();
  }

  function guardarRegistros() {
    const payload = {
      meta: {
        updatedAt: new Date().toISOString(),
        ultimoCorte,
        metasUltimoCorte
      },
      registros
    };
    return saveToBin(RENDIMIENTO_BIN_ID, payload)
      .then(() => {
        lastUpdateISO = payload.meta.updatedAt;
        actualizarLastSaved();
      });
  }

  // ==== Cálculos ====

  function registrosDelDia(fechaSel) {
    if (!fechaSel) return [];
    return registros.filter(r => r.fecha === fechaSel);
  }

  function totalesPorSucursalDia(fechaSel) {
    const res = {};
    if (!fechaSel) return res;
    registros.forEach(r => {
      if (!r.sucursal || r.fecha !== fechaSel) return;
      const suc = r.sucursal;
      const monto = parseMonto(r.monto);
      res[suc] = (res[suc] || 0) + monto;
    });
    return res;
  }

  function totalesPorSucursalAcumulado() {
    const res = {};
    registros.forEach(r => {
      if (!esRegistroVigente(r) || !r.sucursal) return;
      const suc = r.sucursal;
      const monto = parseMonto(r.monto);
      res[suc] = (res[suc] || 0) + monto;
    });
    return res;
  }

  function totalesPorDependienteGlobal() {
    const res = {};
    registros.forEach(r => {
      if (!esRegistroVigente(r) || !r.dependiente) return;
      const dep = r.dependiente;
      const monto = parseMonto(r.monto);
      res[dep] = (res[dep] || 0) + monto;
    });
    return res;
  }

  function totalesPorDepYSucursal() {
    const res = {};
    registros.forEach(r => {
      if (!esRegistroVigente(r) || !r.dependiente || !r.sucursal) return;
      const dep = r.dependiente;
      const suc = r.sucursal;
      const monto = parseMonto(r.monto);
      if (!res[dep]) res[dep] = {};
      res[dep][suc] = (res[dep][suc] || 0) + monto;
    });
    return res;
  }

  function totalesMesPorSucursal(fechaSel) {
    const resActual = {};
    const resAnterior = {};

    if (!fechaSel) return { actual: resActual, anterior: resAnterior };

    const [yStr, mStr] = fechaSel.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10); // 1-12

    const monthActual = `${year}-${mStr}`;
    let yearAnt = year;
    let monthAntNum = month - 1;
    if (monthAntNum <= 0) {
      monthAntNum = 12;
      yearAnt = year - 1;
    }
    const monthAnt = `${yearAnt}-${String(monthAntNum).padStart(2, '0')}`;

    registros.forEach(r => {
      if (!r.sucursal || !r.fecha) return;
      const suc = r.sucursal;
      const mes = r.fecha.slice(0, 7);
      const monto = parseMonto(r.monto);
      if (mes === monthActual) {
        resActual[suc] = (resActual[suc] || 0) + monto;
      } else if (mes === monthAnt) {
        resAnterior[suc] = (resAnterior[suc] || 0) + monto;
      }
    });

    return { actual: resActual, anterior: resAnterior };
  }

  // ==== Render de vistas ====

  function renderResumenSucursales() {
    const fechaSel = fechaInput.value || '';
    const totalesAcum = totalesPorSucursalAcumulado();
    const totalesDia  = totalesPorSucursalDia(fechaSel);
    const { metasSucursal, metaPersonal } = getMetasContextuales();
    const { actual: totMesActual, anterior: totMesAnt } = totalesMesPorSucursal(fechaSel);

    resumenSucursalesContainer.innerHTML = '';

    config.sucursales.forEach(suc => {
      const meta = metasSucursal[suc] || 0;
      const totalAcum = totalesAcum[suc] || 0;
      const totalDia = totalesDia[suc] || 0;
      const pctAcum = meta > 0 ? Math.min(100, (totalAcum / meta) * 100) : 0;

      const totalMesAct = totMesActual[suc] || 0;
      const totalMesAnt = totMesAnt[suc] || 0;
      let comparativo = 'Sin datos de meses para comparar.';
      if (totalMesAnt > 0) {
        const diff = totalMesAct - totalMesAnt;
        const pct = (diff / totalMesAnt) * 100;
        const signo = diff >= 0 ? '+' : '';
        comparativo = `Mes actual: ${formatMoney(totalMesAct)} • Mes anterior: ${formatMoney(totalMesAnt)} (${signo}${pct.toFixed(1)}%)`;
      } else if (totalMesAct > 0) {
        comparativo = `Mes actual: ${formatMoney(totalMesAct)} • Mes anterior: ${formatMoney(0)} (sin datos comparables)`;
      }

      const cardRow = document.createElement('div');
      cardRow.className = 'd-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2';

      const left = document.createElement('div');
      left.className = 'flex-grow-1';

      const title = document.createElement('div');
      title.className = 'd-flex align-items-center justify-content-between flex-wrap gap-2';
      title.innerHTML = `
        <div>
          <strong>${suc}</strong>
        </div>
        <div class="text-xs text-muted">
          Meta sucursal: <strong>${formatMoney(meta)}</strong>
        </div>
      `;

      const progressWrap = document.createElement('div');
      progressWrap.className = 'mt-1';
      progressWrap.innerHTML = `
        <div class="d-flex justify-content-between text-xs mb-1">
          <span>Acumulado: <strong>${formatMoney(totalAcum)}</strong></span>
          <span>${pctAcum.toFixed(1)}%</span>
        </div>
        <div class="progress">
          <div class="progress-bar" role="progressbar" style="width:${pctAcum}%" aria-valuenow="${pctAcum.toFixed(1)}" aria-valuemin="0" aria-valuemax="100"></div>
        </div>
        <div class="d-flex justify-content-between text-xs mt-1">
          <span>Venta diaria: <strong>${formatMoney(totalDia)}</strong></span>
        </div>
        <div class="text-xs text-muted mt-1">
          ${comparativo}
        </div>
      `;

      left.appendChild(title);
      left.appendChild(progressWrap);

      cardRow.appendChild(left);
      resumenSucursalesContainer.appendChild(cardRow);

      const hr = document.createElement('hr');
      hr.className = 'my-2';
      resumenSucursalesContainer.appendChild(hr);
    });

    if (resumenSucursalesContainer.lastChild && resumenSucursalesContainer.lastChild.tagName === 'HR') {
      resumenSucursalesContainer.removeChild(resumenSucursalesContainer.lastChild);
    }
  }

  function renderRendimientoDependientes() {
    const totalesGlobal = totalesPorDependienteGlobal();
    const porDepSuc = totalesPorDepYSucursal();
    const { metaPersonal, metasSucursal } = getMetasContextuales();

    const dependientesOrdenados = [...config.dependientes].sort((a, b) => {
      const ta = totalesGlobal[a] || 0;
      const tb = totalesGlobal[b] || 0;
      return tb - ta;
    });

    tbodyDependientesAcumulado.innerHTML = '';

    dependientesOrdenados.forEach(dep => {
      const totalDep = totalesGlobal[dep] || 0;
      const pctGlobal = metaPersonal > 0 ? Math.min(999, (totalDep / metaPersonal) * 100) : 0;

      const tr = document.createElement('tr');

      const tdDep = document.createElement('td');
      tdDep.textContent = dep;

      const tdGlobal = document.createElement('td');
      tdGlobal.innerHTML = `
        <div class="d-flex justify-content-between text-xs mb-1">
          <span>${formatMoney(totalDep)}</span>
          <span>${formatMoney(metaPersonal)} (${pctGlobal.toFixed(1)}%)</span>
        </div>
        <div class="progress progress-sm">
          <div class="progress-bar" role="progressbar" style="width:${Math.min(100, pctGlobal)}%" aria-valuenow="${pctGlobal.toFixed(1)}" aria-valuemin="0" aria-valuemax="100"></div>
        </div>
      `;

      const tdDetalle = document.createElement('td');
      tdDetalle.className = 'text-xs';

      const detalleLines = [];
      const porSuc = porDepSuc[dep] || {};
      config.sucursales.forEach(suc => {
        const montoSuc = porSuc[suc] || 0;
        if (montoSuc <= 0) return;
        const metaSuc = metasSucursal[suc] || 0;
        const pctSucMeta = metaSuc > 0 ? (montoSuc / metaSuc) * 100 : 0;
        detalleLines.push(
          `<div>${suc}: <strong>${formatMoney(montoSuc)}</strong> (${pctSucMeta.toFixed(1)}% de meta sucursal)</div>`
        );
      });

      if (detalleLines.length === 0) {
        tdDetalle.textContent = 'Sin aportes registrados en el periodo seleccionado.';
      } else {
        tdDetalle.innerHTML = detalleLines.join('');
      }

      tr.appendChild(tdDep);
      tr.appendChild(tdGlobal);
      tr.appendChild(tdDetalle);
      tbodyDependientesAcumulado.appendChild(tr);
    });
  }

  function renderRegistrosDia() {
    const fechaSel = fechaInput.value || '';
    const lista = registrosDelDia(fechaSel);
    const totalesAcum = totalesPorSucursalAcumulado();

    tbodyRegistrosDia.innerHTML = '';

    let ventaDiariaTotal = 0;
    lista.forEach((r, idx) => {
      const tr = document.createElement('tr');

      const tdIdx = document.createElement('td');
      tdIdx.textContent = String(idx + 1);

      const tdDep = document.createElement('td');
      tdDep.textContent = r.dependiente || '';

      const tdSuc = document.createElement('td');
      tdSuc.textContent = r.sucursal || '';

      const monto = parseMonto(r.monto);
      ventaDiariaTotal += monto;
      const tdMonto = document.createElement('td');
      tdMonto.className = 'text-end';
      tdMonto.textContent = formatMoney(monto);

      const tdNota = document.createElement('td');
      tdNota.textContent = r.nota || '';

      const tdAcc = document.createElement('td');
      tdAcc.className = 'text-center';
      const btnDel = document.createElement('button');
      btnDel.className = 'btn btn-sm btn-outline-secondary';
      btnDel.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
      btnDel.addEventListener('click', () => {
        Swal.fire({
          title: '¿Eliminar registro?',
          text: 'Esta acción no se puede deshacer.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Eliminar'
        }).then(res => {
          if (res.isConfirmed) {
            const idxGlobal = registros.indexOf(r);
            if (idxGlobal >= 0) {
              registros.splice(idxGlobal, 1);
              guardarRegistros().then(() => {
                recomputarDiasConRegistros();
                recomputarTodo();
              });
            }
          }
        });
      });
      tdAcc.appendChild(btnDel);

      tr.appendChild(tdIdx);
      tr.appendChild(tdDep);
      tr.appendChild(tdSuc);
      tr.appendChild(tdMonto);
      tr.appendChild(tdNota);
      tr.appendChild(tdAcc);

      tbodyRegistrosDia.appendChild(tr);
    });

    ventaDiariaTotalSpan.textContent = formatMoney(ventaDiariaTotal);

    let ventaAcumTotal = 0;
    Object.values(totalesAcum).forEach(v => { ventaAcumTotal += v; });
    ventaAcumuladaTotalSpan.textContent = formatMoney(ventaAcumTotal);
  }

  function recomputarTodo() {
    renderResumenSucursales();
    renderRendimientoDependientes();
    renderRegistrosDia();
  }

  // ==== Agregar nuevo registro ====

  async function onAgregarRegistro() {
    const fechaSel = fechaInput.value || hoyISO();
    const suc = sucursalInput.value || '';
    const dep = dependienteInput.value || '';
    const montoVal = parseMonto(montoInput.value);
    const nota = (notaInput.value || '').trim();

    if (!fechaSel) {
      await Swal.fire('Fecha requerida', 'Selecciona una fecha para el registro.', 'warning');
      return;
    }
    if (!suc) {
      await Swal.fire('Sucursal requerida', 'Selecciona una sucursal.', 'warning');
      return;
    }
    if (!dep) {
      await Swal.fire('Dependientx requerido', 'Selecciona un dependientx.', 'warning');
      return;
    }
    if (montoVal <= 0) {
      await Swal.fire('Monto inválido', 'Ingresa un monto mayor que cero.', 'warning');
      return;
    }

    const nuevo = {
      fecha: fechaSel,
      sucursal: suc,
      dependiente: dep,
      monto: montoVal,
      nota
    };

    registros.push(nuevo);
    await guardarRegistros();
    recomputarDiasConRegistros();
    recomputarTodo();

    montoInput.value = '';
    notaInput.value = '';
    montoInput.focus();
  }

  // ==== Estado de cuenta (PDF) ====

  async function generarPdfEstadoCuenta() {
    const dep = dependienteEstadoCuenta.value || '';
    if (!dep) {
      await Swal.fire('Selecciona dependientx', 'Elige un dependientx para generar el estado de cuenta.', 'warning');
      return;
    }

    const fechaSel = fechaInput.value || hoyISO();
    const registrosDep = registros
      .filter(r => r.dependiente === dep && esRegistroVigente(r))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));

    if (registrosDep.length === 0) {
      await Swal.fire('Sin registros', 'No hay registros vigentes para este dependientx en el periodo seleccionado.', 'info');
      return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const { metaPersonal } = getMetasContextuales();

    let totalDep = 0;
    const rows = registrosDep.map(r => {
      const m = parseMonto(r.monto);
      totalDep += m;
      return [
        r.fecha || '',
        r.sucursal || '',
        formatMoney(m),
        r.nota || ''
      ];
    });

    doc.setFontSize(14);
    doc.text('Estado de cuenta — Dependientx', 10, 12);
    doc.setFontSize(11);
    doc.text(`Nombre: ${dep}`, 10, 20);
    doc.text(`Fecha de corte: ${fechaSel}`, 10, 26);

    doc.setFontSize(10);
    doc.text(`Meta personal (contextual): ${formatMoney(metaPersonal)}`, 10, 34);
    doc.text(`Total aportado en el periodo: ${formatMoney(totalDep)}`, 10, 40);
    if (metaPersonal > 0) {
      const pct = (totalDep / metaPersonal) * 100;
      doc.text(`Avance meta personal: ${pct.toFixed(1)}%`, 10, 46);
    }

    doc.autoTable({
      startY: 52,
      head: [['Fecha', 'Sucursal', 'Monto', 'Nota']],
      body: rows,
      styles: { fontSize: 9 }
    });

    const fileNameSafe = dep.replace(/[^a-zA-Z0-9]/g, '_') || 'dependientx';
    doc.save(`EstadoCuenta_${fileNameSafe}.pdf`);
  }

  // ==== Inicialización de Flatpickr ====

  function initDatePicker() {
    fpInstance = flatpickr(fechaInput, {
      dateFormat: 'Y-m-d',
      defaultDate: hoyISO(),
      onChange: () => {
        recomputarTodo();
      },
      onDayCreate: (dObj, dStr, fp, dayElem) => {
        const date = dayElem.dateObj.toISOString().slice(0,10);
        if (diasConRegistros.has(date)) {
          dayElem.classList.add('has-record');
        }
      }
    });
  }

  // ==== Corte de mes ====

  if (btnCorteMes) {
    btnCorteMes.addEventListener('click', () => {
      const baseStr = fechaInput.value || hoyISO();
      const baseDate = parseISODate(baseStr) || new Date();
      const lastDay = ultimoDiaMes(baseDate);
      const yyyy = lastDay.getFullYear();
      const mm   = String(lastDay.getMonth()+1).padStart(2,'0');
      const dd   = String(lastDay.getDate()).padStart(2,'0');
      const isoCorte  = `${yyyy}-${mm}-${dd}`;

      // El corte se guarda hasta el último día del mes seleccionado
      ultimoCorte = isoCorte;

      // Snapshot de metas en el momento del corte
      metasUltimoCorte = {
        metasSucursal: { ...config.metasSucursal },
        metaPersonal: config.metaPersonal
      };

      // Día siguiente al corte: nuevo periodo de recolección
      const nextDate = new Date(lastDay.getTime() + 24*60*60*1000);
      const yyyyN = nextDate.getFullYear();
      const mmN   = String(nextDate.getMonth()+1).padStart(2,'0');
      const ddN   = String(nextDate.getDate()).padStart(2,'0');
      const isoNext = `${yyyyN}-${mmN}-${ddN}`;

      guardarRegistros()
        .then(() => {
          Swal.fire('Corte de mes realizado', `Se aplicó corte al ${isoCorte}.
Desde el día siguiente el acumulado inicia en cero.`, 'success');
          if (fpInstance){
            fpInstance.setDate(isoNext, true);
          } else {
            fechaInput.value = isoNext;
            recomputarTodo();
          }
        })
        .catch(err => {
          console.error('Error guardando corte:', err);
          Swal.fire('Error','No se pudo guardar el corte.','error');
        });
    });
  }

  // ==== Eventos ====

  btnHoy.addEventListener('click', () => {
    if (fpInstance) {
      fpInstance.setDate(hoyISO(), true);
    } else {
      fechaInput.value = hoyISO();
      recomputarTodo();
    }
  });

  btnAgregar.addEventListener('click', () => {
    onAgregarRegistro().catch(err => {
      console.error(err);
      Swal.fire('Error', String(err), 'error');
    });
  });

  btnEstadoCuenta.addEventListener('click', () => {
    generarPdfEstadoCuenta().catch(err => {
      console.error(err);
      Swal.fire('Error', String(err), 'error');
    });
  });

  sucursalTablasSelect.addEventListener('change', () => {
    // Actualmente no filtramos por sucursal en las tablas de abajo,
    // pero se deja el evento listo para futuras extensiones.
    recomputarTodo();
  });

  // ==== Init ====

  async function init() {
    try {
      await cargarConfig();
      poblarSelects();
      initDatePicker();
      await cargarRegistros();
      if (!fechaInput.value) {
        fechaInput.value = hoyISO();
      }
      recomputarTodo();
    } catch (err) {
      console.error(err);
      Swal.fire('Error', 'No se pudo inicializar TRRendimiento. Revisa la consola para más detalles.', 'error');
    }
  }

  init();
});
