document.addEventListener('DOMContentLoaded', async () => {
  const $ = (id) => document.getElementById(id);

  const lastUpdatedBadge = $('lastUpdated');

  const fechaFiltro = $('fechaFiltro');
  const sucursalFiltro = $('sucursalFiltro');
  const diasConRegistrosWrap = $('diasConRegistros');

  const dependienteInput = $('dependienteInput');
  const sucursalInput = $('sucursalInput');
  const montoInput = $('montoInput');
  const btnAgregarRegistro = $('btnAgregarRegistro');

  const dependienteEstadoCuenta = $('dependienteEstadoCuenta');
  const btnEstadoCuentaPDF = $('btnEstadoCuentaPDF');

  const btnCorteMensual = $('btnCorteMensual');

  const ventaDiariaSucursalEl = $('ventaDiariaSucursal');
  const ventaTotalSucursalEl = $('ventaTotalSucursal');
  const ventaDiariaGlobalEl = $('ventaDiariaGlobal');
  const ventaTotalGlobalEl = $('ventaTotalGlobal');

  const tablaSucursalesWrap = $('tablaSucursales');
  const tablaDependientesWrap = $('tablaDependientes');
  const tablaRegistrosDiaWrap = $('tablaRegistrosDia');

  // Estado en memoria
  let CONFIG = {
    dependientes: [],
    sucursales: [],
    metas: {
      sucursal: {},            // { sucursal: meta }
      metaPersonalGlobal: 0    // número
    }
  };

  let registros = [];          // [{id, fecha, dependiente, sucursal, monto}]
  let metaGlobal = {
    updatedAt: null,
    ultimaFechaCorte: null,    // 'YYYY-MM-DD' o null
    cortes: []                 // array de cortes mensuales
  };

  // ---------- Utilidades ----------

  function hoyISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function parseMonto(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    const cleaned = String(str).replace(/[^0-9.,-]/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }

  function clamp(num, min, max) {
    return Math.min(max, Math.max(min, num));
  }

  function getRegistrosAcumuladoActual() {
    const corte = metaGlobal.ultimaFechaCorte;
    if (!corte) return registros.slice();
    return registros.filter(r => r.fecha > corte);
  }

  function getRegistrosDia(fecha) {
    if (!fecha) return [];
    return registros.filter(r => r.fecha === fecha);
  }

  function getDiasConRegistros() {
    const set = new Set(registros.map(r => r.fecha));
    return Array.from(set).sort();
  }

  function sumBy(arr, selector) {
    return arr.reduce((acc, item) => acc + (selector(item) || 0), 0);
  }

  // ---------- Carga inicial ----------

  async function initConfig() {
    try {
      const cfg = await fetchRendimientoConfig();
      CONFIG.dependientes = Array.isArray(cfg.dependientes) ? cfg.dependientes : [];
      CONFIG.sucursales = Array.isArray(cfg.sucursales) ? cfg.sucursales : [];
      CONFIG.metas = cfg.metas || CONFIG.metas;
    } catch (err) {
      console.error('Error cargando configuración:', err);
      Swal.fire('Error', 'No se pudo cargar la configuración desde Google Sheets.', 'error');
    }

    // Poblar selects
    const depOptions = ['<option value="">Selecciona…</option>']
      .concat(CONFIG.dependientes.map(d => `<option value="${d}">${d}</option>`));
    dependienteInput.innerHTML = depOptions.join('');
    dependienteEstadoCuenta.innerHTML = depOptions.join('');

    const sucOptions = ['<option value="">Selecciona…</option>']
      .concat(CONFIG.sucursales.map(s => `<option value="${s}">${s}</option>`));
    sucursalInput.innerHTML = sucOptions.join('');

    const sucFiltroOptions = ['<option value="">Todas las sucursales</option>']
      .concat(CONFIG.sucursales.map(s => `<option value="${s}">${s}</option>`));
    sucursalFiltro.innerHTML = sucFiltroOptions.join('');
  }

  async function initData() {
    try {
      const data = await loadRendimientoFromBin();
      if (data && Array.isArray(data.registros)) {
        registros = data.registros.map(r => ({
          id: r.id || String(Date.now()) + Math.random().toString(16).slice(2),
          fecha: r.fecha,
          dependiente: r.dependiente,
          sucursal: r.sucursal,
          monto: parseMonto(r.monto)
        }));
      } else {
        registros = [];
      }
      if (data && data.meta) {
        metaGlobal = {
          updatedAt: data.meta.updatedAt || null,
          ultimaFechaCorte: data.meta.ultimaFechaCorte || null,
          cortes: Array.isArray(data.meta.cortes) ? data.meta.cortes : []
        };
      } else {
        metaGlobal = { updatedAt: null, ultimaFechaCorte: null, cortes: [] };
      }
      lastUpdatedBadge.innerHTML = '<i class="fa-solid fa-clock-rotate-left me-1"></i>' + formatSV(metaGlobal.updatedAt);
    } catch (err) {
      console.error('Error cargando rendimiento:', err);
      registros = [];
      metaGlobal = { updatedAt: null, ultimaFechaCorte: null, cortes: [] };
      lastUpdatedBadge.innerHTML = '<i class="fa-solid fa-clock-rotate-left me-1"></i>Aún no guardado.';
    }
  }

  async function guardarEstado() {
    const payload = {
      meta: {
        updatedAt: new Date().toISOString(),
        ultimaFechaCorte: metaGlobal.ultimaFechaCorte,
        cortes: metaGlobal.cortes || []
      },
      registros
    };
    const resp = await saveRendimientoToBin(payload);
    metaGlobal.updatedAt = payload.meta.updatedAt;
    lastUpdatedBadge.innerHTML = '<i class="fa-solid fa-clock-rotate-left me-1"></i>' + formatSV(metaGlobal.updatedAt);
    return resp;
  }

  // ---------- Render ----------

  function renderDiasConRegistros() {
    const dias = getDiasConRegistros();
    const selected = fechaFiltro.value;
    if (!dias.length) {
      diasConRegistrosWrap.innerHTML = '<span class="text-muted">Sin registros aún.</span>';
      return;
    }
    diasConRegistrosWrap.innerHTML = dias.map(d => {
      const dd = d.slice(8, 10);
      const mm = d.slice(5, 7);
      const cls = d === selected ? 'badge bg-primary badge-dia-registro active' : 'badge bg-secondary badge-dia-registro';
      return `<span class="${cls}" data-fecha="${d}">${dd}/${mm}</span>`;
    }).join(' ');
  }

  function renderResumenes() {
    const fecha = fechaFiltro.value;
    const sucSel = sucursalFiltro.value || '';

    const registrosDia = getRegistrosDia(fecha);
    const registrosDiaSuc = sucSel ? registrosDia.filter(r => r.sucursal === sucSel) : registrosDia;

    const registrosAcum = getRegistrosAcumuladoActual();
    const registrosAcumSuc = sucSel ? registrosAcum.filter(r => r.sucursal === sucSel) : registrosAcum;

    const ventaDiariaSuc = sumBy(registrosDiaSuc, r => r.monto);
    const ventaTotalSuc = sumBy(registrosAcumSuc, r => r.monto);
    const ventaDiariaGlobal = sumBy(registrosDia, r => r.monto);
    const ventaTotalGlobal = sumBy(registrosAcum, r => r.monto);

    ventaDiariaSucursalEl.textContent = formatCurrency(ventaDiariaSuc);
    ventaTotalSucursalEl.textContent = formatCurrency(ventaTotalSuc);
    ventaDiariaGlobalEl.textContent = formatCurrency(ventaDiariaGlobal);
    ventaTotalGlobalEl.textContent = formatCurrency(ventaTotalGlobal);
  }

  function renderTablaSucursales() {
    const registrosAcum = getRegistrosAcumuladoActual();
    const ultimaCorte = (metaGlobal.cortes && metaGlobal.cortes.length)
      ? metaGlobal.cortes[metaGlobal.cortes.length - 1]
      : null;

    let html = '<table class="table table-sm align-middle mb-0">';
    html += '<thead class="table-light"><tr>';
    html += '<th>Sucursal</th>';
    html += '<th class="text-end">Total acumulado</th>';
    html += '<th class="text-end">Meta sucursal</th>';
    html += '<th style="width:35%">Avance</th>';
    html += '<th class="text-xs text-muted text-end">Mes anterior</th>';
    html += '</tr></thead><tbody>';

    if (!CONFIG.sucursales.length) {
      html += '<tr><td colspan="5" class="text-center text-muted py-3">Sin sucursales configuradas.</td></tr>';
    } else {
      for (const suc of CONFIG.sucursales) {
        const totalSuc = sumBy(registrosAcum.filter(r => r.sucursal === suc), r => r.monto);
        const metaSuc = parseMonto(CONFIG.metas.sucursal?.[suc] ?? 0);
        const pct = metaSuc > 0 ? (totalSuc / metaSuc) * 100 : 0;
        const pctClampVal = clamp(pct, 0, 999);
        const prevTotal = ultimaCorte && ultimaCorte.totalesPorSucursal
          ? parseMonto(ultimaCorte.totalesPorSucursal[suc] ?? 0)
          : 0;
        const diff = totalSuc - prevTotal;
        const varPct = prevTotal > 0 ? (diff / prevTotal) * 100 : (totalSuc > 0 ? 100 : 0);

        html += '<tr>';
        html += `<td>${suc}</td>`;
        html += `<td class="text-end">${formatCurrency(totalSuc)}</td>`;
        html += `<td class="text-end">${formatCurrency(metaSuc)}</td>`;
        html += '<td>';
        html += `<div class="progress" role="progressbar" aria-valuenow="${pctClampVal.toFixed(1)}" aria-valuemin="0" aria-valuemax="100">`;
        html += `<div class="progress-bar bg-success" style="width:${clamp(pct,0,100).toFixed(1)}%"></div>`;
        html += '</div>';
        html += `<div class="d-flex justify-content-between text-muted progress-label mt-1">`;
        html += `<span>${pct.toFixed(1)}% de la meta</span>`;
        html += `<span>${formatCurrency(totalSuc)} / ${formatCurrency(metaSuc)}</span>`;
        html += '</div>';
        html += '</td>';

        html += '<td class="text-end text-xs text-muted">';
        html += `${formatCurrency(prevTotal)}<br>`;
        const signo = diff > 0 ? '+' : '';
        html += `<span class="${diff >= 0 ? 'text-success' : 'text-danger'}">${signo}${formatCurrency(diff)} (${signo}${varPct.toFixed(1)}%)</span>`;
        html += '</td>';

        html += '</tr>';
      }
    }

    html += '</tbody></table>';
    tablaSucursalesWrap.innerHTML = html;
  }

  function renderTablaDependientes() {
    const registrosAcum = getRegistrosAcumuladoActual();
    const metaPersonal = parseMonto(CONFIG.metas.metaPersonalGlobal ?? 0);

    let html = '<table class="table table-sm align-middle mb-0">';
    html += '<thead class="table-light"><tr>';
    html += '<th>Dependientx</th>';
    html += '<th class="text-end">Total global</th>';
    html += '<th class="text-end">Meta personal (global)</th>';
    html += '<th style="width:35%">Avance</th>';
    html += '<th class="text-xs text-muted">Detalle por sucursal</th>';
    html += '</tr></thead><tbody>';

    if (!CONFIG.dependientes.length) {
      html += '<tr><td colspan="5" class="text-center text-muted py-3">Sin dependientxs configurados.</td></tr>';
    } else {
      for (const dep of CONFIG.dependientes) {
        const registrosDep = registrosAcum.filter(r => r.dependiente === dep);
        const totalDep = sumBy(registrosDep, r => r.monto);
        const pct = metaPersonal > 0 ? (totalDep / metaPersonal) * 100 : 0;

        // Detalle por sucursal (solo texto)
        const detalles = [];
        for (const suc of CONFIG.sucursales) {
          const totalDepSuc = sumBy(registrosDep.filter(r => r.sucursal === suc), r => r.monto);
          if (totalDepSuc <= 0) continue;
          const totalSuc = sumBy(registrosAcum.filter(r => r.sucursal === suc), r => r.monto);
          const pctSuc = totalSuc > 0 ? (totalDepSuc / totalSuc) * 100 : 0;
          detalles.push(`${suc}: ${formatCurrency(totalDepSuc)} (${pctSuc.toFixed(1)}% de la sucursal)`);
        }

        html += '<tr>';
        html += `<td>${dep}</td>`;
        html += `<td class="text-end">${formatCurrency(totalDep)}</td>`;
        html += `<td class="text-end">${formatCurrency(metaPersonal)}</td>`;
        html += '<td>';
        html += `<div class="progress" role="progressbar" aria-valuenow="${clamp(pct,0,100).toFixed(1)}" aria-valuemin="0" aria-valuemax="100">`;
        html += `<div class="progress-bar bg-info" style="width:${clamp(pct,0,100).toFixed(1)}%"></div>`;
        html += '</div>';
        html += `<div class="d-flex justify-content-between text-muted progress-label mt-1">`;
        html += `<span>${pct.toFixed(1)}% de la meta</span>`;
        html += `<span>${formatCurrency(totalDep)} / ${formatCurrency(metaPersonal)}</span>`;
        html += '</div>';
        html += '</td>';

        html += '<td class="text-xs text-muted">';
        if (detalles.length) {
          html += detalles.map(d => `<div>${d}</div>`).join('');
        } else {
          html += '<span class="text-muted">Sin aporte por sucursal aún.</span>';
        }
        html += '</td>';

        html += '</tr>';
      }
    }

    html += '</tbody></table>';
    tablaDependientesWrap.innerHTML = html;
  }

  function renderTablaRegistrosDia() {
    const fecha = fechaFiltro.value;
    const sucSel = sucursalFiltro.value || '';
    const registrosDia = getRegistrosDia(fecha);
    const registrosDiaSuc = sucSel ? registrosDia.filter(r => r.sucursal === sucSel) : registrosDia;

    let html = '<table class="table table-sm align-middle mb-0">';
    html += '<thead class="table-light"><tr>';
    html += '<th>Dependientx</th>';
    html += '<th>Sucursal</th>';
    html += '<th class="text-end">Monto</th>';
    html += '<th class="text-center text-xs">Acciones</th>';
    html += '</tr></thead><tbody>';

    if (!registrosDiaSuc.length) {
      html += '<tr><td colspan="4" class="text-center text-muted py-3">Sin registros para esta fecha/sucursal.</td></tr>';
    } else {
      for (const r of registrosDiaSuc) {
        html += '<tr>';
        html += `<td>${r.dependiente}</td>`;
        html += `<td>${r.sucursal}</td>`;
        html += `<td class="text-end">${formatCurrency(r.monto)}</td>`;
        html += `<td class="text-center">
          <button class="btn btn-sm btn-outline-danger btn-eliminar-registro" data-id="${r.id}">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </td>`;
        html += '</tr>';
      }
    }

    html += '</tbody></table>';
    tablaRegistrosDiaWrap.innerHTML = html;

    // Listeners para eliminar
    tablaRegistrosDiaWrap.querySelectorAll('.btn-eliminar-registro').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const id = ev.currentTarget.getAttribute('data-id');
        const res = await Swal.fire({
          title: 'Eliminar registro',
          text: '¿Seguro que deseas eliminar este registro?',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Sí, eliminar',
          cancelButtonText: 'Cancelar'
        });
        if (!res.isConfirmed) return;
        registros = registros.filter(r => r.id !== id);
        await guardarEstado();
        renderAll();
      });
    });
  }

  function renderAll() {
    renderDiasConRegistros();
    renderResumenes();
    renderTablaSucursales();
    renderTablaDependientes();
    renderTablaRegistrosDia();
  }

  // ---------- Acciones ----------

  async function handleAgregarRegistro() {
    const fecha = fechaFiltro.value || hoyISO();
    const dep = dependienteInput.value;
    const suc = sucursalInput.value;
    const monto = parseMonto(montoInput.value);

    if (!fecha) {
      Swal.fire('Atención', 'Selecciona una fecha válida.', 'info');
      return;
    }
    if (!dep) {
      Swal.fire('Atención', 'Selecciona un dependientx.', 'info');
      return;
    }
    if (!suc) {
      Swal.fire('Atención', 'Selecciona una sucursal.', 'info');
      return;
    }
    if (monto <= 0) {
      Swal.fire('Atención', 'Ingresa un monto mayor a 0.', 'info');
      return;
    }

    registros.push({
      id: String(Date.now()) + Math.random().toString(16).slice(2),
      fecha,
      dependiente: dep,
      sucursal: suc,
      monto
    });

    try {
      await guardarEstado();
      montoInput.value = '';
      renderAll();
    } catch (err) {
      console.error('Error guardando registro:', err);
      Swal.fire('Error', 'No se pudo guardar el registro.', 'error');
    }
  }

  async function handleCorteMensual() {
    if (!registros.length) {
      Swal.fire('Sin datos', 'No hay registros para realizar un corte.', 'info');
      return;
    }
    const res = await Swal.fire({
      title: 'Corte mensual',
      text: 'Se generará un corte con los datos acumulados desde el último corte. ¿Deseas continuar?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, hacer corte',
      cancelButtonText: 'Cancelar'
    });
    if (!res.isConfirmed) return;

    const corteAnterior = metaGlobal.ultimaFechaCorte;
    const registrosPeriodo = corteAnterior
      ? registros.filter(r => r.fecha > corteAnterior)
      : registros.slice();

    if (!registrosPeriodo.length) {
      Swal.fire('Sin datos', 'No hay registros nuevos desde el último corte.', 'info');
      return;
    }

    const fechas = registrosPeriodo.map(r => r.fecha).sort();
    const desde = fechas[0];
    const hasta = fechas[fechas.length - 1];
    const hoy = hoyISO();

    const totalesPorSucursal = {};
    const totalesPorDependiente = {};
    let totalGeneral = 0;

    for (const r of registrosPeriodo) {
      const m = r.monto || 0;
      totalesPorSucursal[r.sucursal] = (totalesPorSucursal[r.sucursal] || 0) + m;
      totalesPorDependiente[r.dependiente] = (totalesPorDependiente[r.dependiente] || 0) + m;
      totalGeneral += m;
    }

    const corte = {
      fechaCorte: hoy,
      desde,
      hasta,
      metasSucursales: CONFIG.metas.sucursal || {},
      metaPersonalGlobal: CONFIG.metas.metaPersonalGlobal || 0,
      totalesPorSucursal,
      totalesPorDependiente,
      totalGeneral
    };

    if (!Array.isArray(metaGlobal.cortes)) metaGlobal.cortes = [];
    metaGlobal.cortes.push(corte);
    metaGlobal.ultimaFechaCorte = hasta; // se considera corte hasta la última fecha con datos

    try {
      await guardarEstado();
      Swal.fire('Corte realizado', 'El corte mensual se guardó correctamente.', 'success');
      renderAll();
    } catch (err) {
      console.error('Error guardando corte:', err);
      Swal.fire('Error', 'No se pudo guardar el corte mensual.', 'error');
    }
  }

  async function handleEstadoCuentaPDF() {
    const dep = dependienteEstadoCuenta.value;
    if (!dep) {
      Swal.fire('Atención', 'Selecciona un dependientx.', 'info');
      return;
    }

    const registrosDep = registros.filter(r => r.dependiente === dep).sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (!registrosDep.length) {
      Swal.fire('Sin datos', 'Este dependientx no tiene registros.', 'info');
      return;
    }

    const totalDep = sumBy(registrosDep, r => r.monto);
    const metaPersonal = parseMonto(CONFIG.metas.metaPersonalGlobal ?? 0);
    const pct = metaPersonal > 0 ? (totalDep / metaPersonal) * 100 : 0;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Encabezado tipo banco
    doc.setFontSize(14);
    doc.text('Estado de cuenta — Rendimiento dependientx', 10, 12);
    doc.setFontSize(10);
    doc.text(`Dependientx: ${dep}`, 10, 20);
    doc.text(`Fecha de emisión: ${new Date().toLocaleString('es-SV')}`, 10, 26);

    doc.text(`Meta personal (global): ${formatCurrency(metaPersonal)}`, 10, 34);
    doc.text(`Total acumulado: ${formatCurrency(totalDep)}`, 10, 40);
    doc.text(`Porcentaje de cumplimiento: ${pct.toFixed(1)}%`, 10, 46);

    // Tabla de movimientos
    const body = registrosDep.map((r, idx) => [
      idx + 1,
      r.fecha,
      r.sucursal,
      formatCurrency(r.monto)
    ]);

    doc.autoTable({
      startY: 52,
      head: [['#', 'Fecha', 'Sucursal', 'Monto']],
      body,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [33, 37, 41] },
      theme: 'striped'
    });

    const fileName = `EstadoCuenta_${dep.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    doc.save(fileName);
  }

  // ---------- Listeners ----------

  btnAgregarRegistro.addEventListener('click', handleAgregarRegistro);
  btnCorteMensual.addEventListener('click', handleCorteMensual);
  btnEstadoCuentaPDF.addEventListener('click', handleEstadoCuentaPDF);

  fechaFiltro.addEventListener('change', () => {
    renderAll();
  });

  sucursalFiltro.addEventListener('change', () => {
    renderAll();
  });

  diasConRegistrosWrap.addEventListener('click', (ev) => {
    const target = ev.target;
    if (target.classList.contains('badge-dia-registro')) {
      const fecha = target.getAttribute('data-fecha');
      if (fecha) {
        fechaFiltro.value = fecha;
        renderAll();
      }
    }
  });

  // ---------- Init ----------

  // Fecha por defecto: hoy
  fechaFiltro.value = hoyISO();

  await initConfig();
  await initData();
  renderAll();
});
