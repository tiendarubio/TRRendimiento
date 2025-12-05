
document.addEventListener('DOMContentLoaded', async () => {
  const $ = (id) => document.getElementById(id);

  const fechaSeleccionadaInput = $('fechaSeleccionada');
  const sucursalFiltro = $('sucursalFiltro');
  const dependientxFiltro = $('dependientxFiltro');

  const dependientxInput = $('dependientxInput');
  const sucursalInput = $('sucursalInput');
  const montoInput = $('montoInput');
  const btnAgregarRegistro = $('btnAgregarRegistro');

  const btnRegistrar = $('btnRegistrar');
  const btnCorteMes = $('btnCorteMes');
  const btnEstadoCuenta = $('btnEstadoCuenta');
  const btnRefrescar = $('btnRefrescar');

  const mesCalendario = $('mesCalendario');
  const calendarioDias = $('calendarioDias');

  const contenedorSucursales = $('contenedorSucursales');
  const tablaRankingBody = $('tablaRankingBody');
  const tablaDiariaBody = $('tablaDiariaBody');

  const lastUpdatedBadge = $('lastUpdatedBadge');
  const lblTotalDiarioGlobal = $('lblTotalDiarioGlobal');
  const lblTotalAcumuladoGlobal = $('lblTotalAcumuladoGlobal');

  let CONFIG = null;    // { dependientxs, sucursales, metasSucursal, metaPersonalGlobal }
  let DATA = null;      // { meta, configMetas, registros, cortes }

  let fechaSeleccionada = null;

  async function init() {
    try {
      CONFIG = await loadRendimientoConfig();
      DATA = await loadRendimientoData();

      if (!DATA.configMetas) {
        DATA.configMetas = {
          metasSucursal: CONFIG.metasSucursal || {},
          metaPersonalGlobal: CONFIG.metaPersonalGlobal || 0
        };
      }

      poblarSelects();
      initFecha();
      initMesCalendario();
      renderCalendario();
      recalcularYRender();

      lastUpdatedBadge.innerHTML = '<i class="fa-solid fa-clock-rotate-left me-1"></i>' +
        'Última actualización: ' + formatSV(DATA.meta.updatedAt);
    } catch (err) {
      console.error(err);
      Swal.fire('Error', String(err), 'error');
    }
  }

  function poblarSelects() {
    const sucursales = CONFIG.sucursales || [];
    sucursalFiltro.innerHTML = '';
    sucursalInput.innerHTML = '';

    sucursales.forEach(s => {
      const opt1 = document.createElement('option');
      opt1.value = s;
      opt1.textContent = s;
      sucursalFiltro.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = s;
      opt2.textContent = s;
      sucursalInput.appendChild(opt2);
    });

    const dependientxs = CONFIG.dependientxs || [];
    dependientxFiltro.innerHTML = '';
    dependientxInput.innerHTML = '';

    dependientxs.forEach(d => {
      const opt1 = document.createElement('option');
      opt1.value = d;
      opt1.textContent = d;
      dependientxFiltro.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = d;
      opt2.textContent = d;
      dependientxInput.appendChild(opt2);
    });
  }

  function initFecha() {
    const hoy = new Date();
    const iso = toISODateOnly(hoy);
    fechaSeleccionada = iso;
    fechaSeleccionadaInput.value = iso;
  }

  function initMesCalendario() {
    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    mesCalendario.value = `${year}-${month}`;
  }

  function getRegistros() {
    return Array.isArray(DATA.registros) ? DATA.registros : [];
  }

  function getFechaUltimoCorte() {
    if (!DATA.meta || !DATA.meta.ultimoCorte) return null;
    return toISODateOnly(DATA.meta.ultimoCorte);
  }

  function getCortes() {
    return Array.isArray(DATA.cortes) ? DATA.cortes : [];
  }

  function getRegistrosCicloActual() {
    const regs = getRegistros();
    const ultimoCorte = getFechaUltimoCorte();
    if (!ultimoCorte) return regs.slice();
    return regs.filter(r => {
      const f = toISODateOnly(r.fecha);
      return f && f > ultimoCorte;
    });
  }

  function getRegistrosFecha(fechaISO) {
    const fRef = toISODateOnly(fechaISO);
    if (!fRef) return [];
    return getRegistros().filter(r => toISODateOnly(r.fecha) === fRef);
  }

  function generarIdRegistro() {
    return 'r_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  async function agregarRegistro() {
    const fecha = fechaSeleccionadaInput.value || fechaSeleccionada;
    const sucursal = sucursalInput.value;
    const dependientx = dependientxInput.value;
    const monto = parseFloat(montoInput.value || '0');

    if (!fecha) {
      Swal.fire('Atención', 'Selecciona una fecha.', 'info');
      return;
    }
    if (!sucursal) {
      Swal.fire('Atención', 'Selecciona una sucursal.', 'info');
      return;
    }
    if (!dependientx) {
      Swal.fire('Atención', 'Selecciona un dependientx.', 'info');
      return;
    }
    if (!monto || monto <= 0) {
      Swal.fire('Atención', 'Ingresa un monto mayor a 0.', 'info');
      return;
    }

    const reg = {
      id: generarIdRegistro(),
      fecha: toISODateOnly(fecha),
      sucursal,
      dependientx,
      monto: Number(monto.toFixed(2))
    };

    DATA.registros.push(reg);
    DATA = await saveRendimientoData(DATA);

    fechaSeleccionada = reg.fecha;
    fechaSeleccionadaInput.value = reg.fecha;
    montoInput.value = '';

    renderCalendario();
    recalcularYRender();

    Swal.fire('Guardado', 'Registro agregado correctamente.', 'success');
  }

  async function manejarCorteMes() {
    const registrosTodos = getRegistros();
    if (registrosTodos.length === 0) {
      Swal.fire('Atención', 'No hay registros para realizar un corte.', 'info');
      return;
    }

    const { isConfirmed } = await Swal.fire({
      title: 'Corte de mes',
      text: 'Se registrará un corte del ciclo actual para comparativos futuros. Los registros no se eliminarán.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, realizar corte',
      cancelButtonText: 'Cancelar'
    });

    if (!isConfirmed) return;

    const regsCiclo = getRegistrosCicloActual();
    if (regsCiclo.length === 0) {
      Swal.fire('Atención', 'No hay registros nuevos desde el último corte.', 'info');
      return;
    }

    const resumenSuc = {};
    const resumenDep = {};

    regsCiclo.forEach(r => {
      if (!resumenSuc[r.sucursal]) resumenSuc[r.sucursal] = 0;
      resumenSuc[r.sucursal] += r.monto || 0;

      if (!resumenDep[r.dependientx]) resumenDep[r.dependientx] = 0;
      resumenDep[r.dependientx] += r.monto || 0;
    });

    const corte = {
      id: 'c_' + Date.now().toString(36),
      fechaCorte: toISODateOnly(new Date()),
      metasSucursal: { ...(DATA.configMetas?.metasSucursal || {}) },
      metaPersonalGlobal: DATA.configMetas?.metaPersonalGlobal || 0,
      resumenPorSucursal: resumenSuc,
      resumenPorDependientx: resumenDep
    };

    DATA.cortes.push(corte);
    DATA.meta.ultimoCorte = corte.fechaCorte;

    DATA = await saveRendimientoData(DATA);

    renderCalendario();
    recalcularYRender();

    Swal.fire('Listo', 'Corte de mes registrado correctamente.', 'success');
  }

  async function generarEstadoCuentaPDF() {
    const dependientx = dependientxFiltro.value;
    if (!dependientx) {
      Swal.fire('Atención', 'Selecciona un dependientx primero.', 'info');
      return;
    }

    const regs = getRegistrosCicloActual().filter(r => r.dependientx === dependientx);
    if (regs.length === 0) {
      Swal.fire('Sin datos', 'No hay registros para este dependientx en el ciclo actual.', 'info');
      return;
    }

    const total = regs.reduce((acc, r) => acc + (r.monto || 0), 0);
    const metaPersonal = DATA.configMetas?.metaPersonalGlobal || 0;
    const avance = metaPersonal > 0 ? (total / metaPersonal) * 100 : 0;

    const fechas = regs.map(r => toISODateOnly(r.fecha)).sort();
    const desde = fechas[0];
    const hasta = fechas[fechas.length - 1];

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(12);
    doc.text('Estado de cuenta — Dependientx', 14, 16);
    doc.setFontSize(10);
    doc.text(`Nombre: ${dependientx}`, 14, 24);
    doc.text(`Período (ciclo actual): ${desde} a ${hasta}`, 14, 30);
    doc.text(`Fecha de emisión: ${toISODateOnly(new Date())}`, 14, 36);

    let y = 44;
    doc.setFontSize(10);
    doc.text('Resumen de movimientos', 14, y);
    y += 6;

    const rows = regs.map((r, idx) => [
      idx + 1,
      toISODateOnly(r.fecha),
      r.sucursal,
      (r.monto || 0).toFixed(2)
    ]);

    doc.autoTable({
      startY: y,
      head: [['#', 'Fecha', 'Sucursal', 'Monto']],
      body: rows,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [13, 110, 253] }
    });

    const finalY = doc.lastAutoTable.finalY || (y + 10);
    const resumenY = finalY + 10;

    doc.setFontSize(10);
    doc.text('Resumen financiero del ciclo', 14, resumenY);
    doc.setFontSize(9);

    doc.text(`Total generado en el ciclo: ${total.toFixed(2)} USD`, 14, resumenY + 6);
    doc.text(`Meta personal global: ${metaPersonal.toFixed(2)} USD`, 14, resumenY + 12);
    doc.text(`Avance de meta personal: ${avance.toFixed(2)} %`, 14, resumenY + 18);

    const fileName = `EstadoCuenta_${dependientx.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    doc.save(fileName);
  }

  function recalcularYRender() {
    renderResumenSucursales();
    renderRankingDependientxs();
    renderTablaDiaria();
    renderTotalesGlobales();
  }

  function renderResumenSucursales() {
    const sucursales = CONFIG.sucursales || [];
    const metasSucursal = DATA.configMetas?.metasSucursal || {};
    const regsCiclo = getRegistrosCicloActual();
    const regsDia = getRegistrosFecha(fechaSeleccionada);

    const totalesCiclo = {};
    const totalesDia = {};

    sucursales.forEach(s => {
      totalesCiclo[s] = 0;
      totalesDia[s] = 0;
    });

    regsCiclo.forEach(r => {
      if (!totalesCiclo.hasOwnProperty(r.sucursal)) totalesCiclo[r.sucursal] = 0;
      totalesCiclo[r.sucursal] += r.monto || 0;
    });

    regsDia.forEach(r => {
      if (!totalesDia.hasOwnProperty(r.sucursal)) totalesDia[r.sucursal] = 0;
      totalesDia[r.sucursal] += r.monto || 0;
    });

    const cortes = getCortes();
    const ultimoCorte = cortes.length ? cortes[cortes.length - 1] : null;
    const resumenPrevio = ultimoCorte ? (ultimoCorte.resumenPorSucursal || {}) : {};

    contenedorSucursales.innerHTML = '';

    sucursales.forEach(s => {
      const meta = Number(metasSucursal[s] || 0);
      const totalCiclo = Number(totalesCiclo[s] || 0);
      const totalDia = Number(totalesDia[s] || 0);
      const avance = meta > 0 ? Math.min(100, (totalCiclo / meta) * 100) : 0;

      const previo = Number(resumenPrevio[s] || 0);
      let diffPct = null;
      if (ultimoCorte && previo > 0) {
        diffPct = ((totalCiclo - previo) / previo) * 100;
      }

      const card = document.createElement('div');
      card.className = 'border rounded-3 p-3 bg-white shadow-sm-sm';

      const header = document.createElement('div');
      header.className = 'd-flex justify-content-between align-items-center mb-1';
      header.innerHTML = `
        <div class="d-flex flex-column">
          <span class="fw-semibold">${s}</span>
          <span class="text-muted small">Meta sucursal: ${formatMoney(meta)}</span>
        </div>
        <div class="text-end">
          <div class="small text-muted">Acumulado</div>
          <div class="fw-semibold">${formatMoney(totalCiclo)}</div>
        </div>
      `;
      card.appendChild(header);

      const progressWrap = document.createElement('div');
      progressWrap.className = 'mb-1';
      progressWrap.innerHTML = `
        <div class="progress">
          <div class="progress-bar bg-primary" role="progressbar" style="width:${avance.toFixed(2)}%;" aria-valuenow="${avance.toFixed(2)}" aria-valuemin="0" aria-valuemax="100">
            ${avance.toFixed(1)}%
          </div>
        </div>
      `;
      card.appendChild(progressWrap);

      const footer = document.createElement('div');
      footer.className = 'd-flex justify-content-between align-items-center small text-muted mt-1';
      const txtDia = `Hoy: ${formatMoney(totalDia)}`;

      let txtDiff = '';
      if (diffPct !== null) {
        const sign = diffPct >= 0 ? '+' : '';
        txtDiff = `Mes anterior vs actual: ${sign}${diffPct.toFixed(1)}%`;
      } else if (ultimoCorte) {
        txtDiff = 'Mes anterior sin datos suficientes';
      } else {
        txtDiff = 'Sin corte previo registrado';
      }

      footer.innerHTML = `
        <span>${txtDia}</span>
        <span class="text-end">${txtDiff}</span>
      `;
      card.appendChild(footer);

      contenedorSucursales.appendChild(card);
    });
  }

  function renderRankingDependientxs() {
    const dependientxs = CONFIG.dependientxs || [];
    const metaPersonal = DATA.configMetas?.metaPersonalGlobal || 0;
    const regsCiclo = getRegistrosCicloActual();

    const totalPorDep = {};
    const detalleSucursales = {};

    dependientxs.forEach(d => {
      totalPorDep[d] = 0;
      detalleSucursales[d] = {};
    });

    regsCiclo.forEach(r => {
      if (!totalPorDep.hasOwnProperty(r.dependientx)) {
        totalPorDep[r.dependientx] = 0;
        detalleSucursales[r.dependientx] = {};
      }
      totalPorDep[r.dependientx] += r.monto || 0;

      if (!detalleSucursales[r.dependientx][r.sucursal]) {
        detalleSucursales[r.dependientx][r.sucursal] = 0;
      }
      detalleSucursales[r.dependientx][r.sucursal] += r.monto || 0;
    });

    const arr = dependientxs.map(d => {
      const total = Number(totalPorDep[d] || 0);
      const avance = metaPersonal > 0 ? (total / metaPersonal) * 100 : 0;
      return { dependientx: d, total, avance, detalle: detalleSucursales[d] || {} };
    });

    arr.sort((a, b) => b.avance - a.avance);

    tablaRankingBody.innerHTML = '';

    arr.forEach((row, idx) => {
      const tr = document.createElement('tr');

      const tdPos = document.createElement('td');
      tdPos.className = 'text-center small text-muted';
      tdPos.textContent = idx + 1;

      const tdNombre = document.createElement('td');
      tdNombre.innerHTML = `<span class="fw-semibold">${row.dependientx}</span>`;

      const tdTotal = document.createElement('td');
      tdTotal.className = 'text-end small';
      tdTotal.textContent = formatMoney(row.total);

      const tdMeta = document.createElement('td');
      tdMeta.className = 'text-end small text-muted';
      tdMeta.textContent = formatMoney(metaPersonal);

      const tdAvance = document.createElement('td');
      const avance = row.avance;
      let badgeClass = 'badge-avance-bajo';
      if (avance >= 80 && avance < 100) badgeClass = 'badge-avance-medio';
      else if (avance >= 100) badgeClass = 'badge-avance-alto';
      tdAvance.innerHTML = `
        <div class="mb-1">
          <div class="progress">
            <div class="progress-bar" role="progressbar" style="width:${Math.min(100, avance).toFixed(2)}%;" aria-valuenow="${avance.toFixed(2)}" aria-valuemin="0" aria-valuemax="100"></div>
          </div>
        </div>
        <span class="badge ${badgeClass} small">${avance.toFixed(1)}%</span>
      `;

      const tdDetalle = document.createElement('td');
      tdDetalle.className = 'small text-muted';
      const partes = Object.entries(row.detalle)
        .filter(([, v]) => v > 0)
        .map(([suc, val]) => `${suc}: ${formatMoney(val)}`);
      tdDetalle.textContent = partes.length ? partes.join(' · ') : 'Sin registros en el ciclo.';

      tr.appendChild(tdPos);
      tr.appendChild(tdNombre);
      tr.appendChild(tdTotal);
      tr.appendChild(tdMeta);
      tr.appendChild(tdAvance);
      tr.appendChild(tdDetalle);

      tablaRankingBody.appendChild(tr);
    });
  }

  function renderTablaDiaria() {
    fechaSeleccionada = toISODateOnly(fechaSeleccionadaInput.value || fechaSeleccionada);
    const regsDia = getRegistrosFecha(fechaSeleccionada);

    tablaDiariaBody.innerHTML = '';

    regsDia.forEach((r, idx) => {
      const tr = document.createElement('tr');

      const tdPos = document.createElement('td');
      tdPos.className = 'text-center small text-muted';
      tdPos.textContent = idx + 1;

      const tdDep = document.createElement('td');
      tdDep.textContent = r.dependientx;

      const tdSuc = document.createElement('td');
      tdSuc.textContent = r.sucursal;

      const tdMonto = document.createElement('td');
      tdMonto.className = 'text-end small';
      tdMonto.textContent = formatMoney(r.monto || 0);

      tr.appendChild(tdPos);
      tr.appendChild(tdDep);
      tr.appendChild(tdSuc);
      tr.appendChild(tdMonto);

      tablaDiariaBody.appendChild(tr);
    });
  }

  function renderTotalesGlobales() {
    const regsCiclo = getRegistrosCicloActual();
    const regsDia = getRegistrosFecha(fechaSeleccionada);

    const totalCiclo = regsCiclo.reduce((acc, r) => acc + (r.monto || 0), 0);
    const totalDia = regsDia.reduce((acc, r) => acc + (r.monto || 0), 0);

    lblTotalAcumuladoGlobal.textContent = formatMoney(totalCiclo);
    lblTotalDiarioGlobal.textContent = formatMoney(totalDia);
  }

  function renderCalendario() {
    const regs = getRegistros();
    const marcadoPorFecha = new Set(regs.map(r => toISODateOnly(r.fecha)));

    const [yearStr, monthStr] = mesCalendario.value.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (!year || !month) return;

    const firstDay = new Date(year, month - 1, 1);
    const startingWeekDay = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month, 0).getDate();

    calendarioDias.innerHTML = '';

    const dayNames = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    dayNames.forEach(name => {
      const hd = document.createElement('div');
      hd.className = 'day-header';
      hd.textContent = name;
      calendarioDias.appendChild(hd);
    });

    for (let i = 0; i < startingWeekDay; i++) {
      const cell = document.createElement('div');
      cell.className = 'day-cell disabled';
      calendarioDias.appendChild(cell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const cellDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const cell = document.createElement('div');
      cell.className = 'day-cell';

      const isSelected = (toISODateOnly(fechaSeleccionada) === cellDate);
      if (isSelected) {
        cell.classList.add('selected');
      }

      if (marcadoPorFecha.has(cellDate)) {
        cell.classList.add('has-record');
      }

      cell.textContent = String(day);
      cell.addEventListener('click', () => {
        fechaSeleccionada = cellDate;
        fechaSeleccionadaInput.value = cellDate;
        renderCalendario();
        recalcularYRender();
      });

      calendarioDias.appendChild(cell);
    }
  }

  fechaSeleccionadaInput.addEventListener('change', () => {
    fechaSeleccionada = toISODateOnly(fechaSeleccionadaInput.value);
    recalcularYRender();
    renderCalendario();
  });

  mesCalendario.addEventListener('change', () => {
    renderCalendario();
  });

  btnAgregarRegistro.addEventListener('click', agregarRegistro);
  btnRegistrar.addEventListener('click', agregarRegistro);
  btnCorteMes.addEventListener('click', manejarCorteMes);
  btnEstadoCuenta.addEventListener('click', generarEstadoCuentaPDF);
  btnRefrescar.addEventListener('click', async () => {
    DATA = await loadRendimientoData();
    recalcularYRender();
    renderCalendario();
    lastUpdatedBadge.innerHTML = '<i class="fa-solid fa-clock-rotate-left me-1"></i>' +
      'Última actualización: ' + formatSV(DATA.meta.updatedAt);
    Swal.fire('Listo', 'Datos recargados desde el servidor.', 'success');
  });

  montoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      agregarRegistro();
    }
  });

  init();
});
