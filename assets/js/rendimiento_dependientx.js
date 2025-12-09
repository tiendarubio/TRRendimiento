document.addEventListener('DOMContentLoaded', async () => {
  const $ = (id) => document.getElementById(id);

  const lastUpdatedBadge = document.getElementById('lastUpdated');

  const fechaFiltro = document.getElementById('fechaFiltro');
  const sucursalFiltro = document.getElementById('sucursalFiltro');
  const diasConRegistrosWrap = document.getElementById('diasConRegistros');

  const dependienteInput = document.getElementById('dependienteInput');
  const sucursalInput = document.getElementById('sucursalInput');
  const montoInput = document.getElementById('montoInput');
  const btnAgregarRegistro = document.getElementById('btnAgregarRegistro');

  const dependienteEstadoCuenta = document.getElementById('dependienteEstadoCuenta');
  const btnEstadoCuentaPDF = document.getElementById('btnEstadoCuentaPDF');

  const btnCorteMensual = document.getElementById('btnCorteMensual');

  const ventaDiariaSucursalEl = document.getElementById('ventaDiariaSucursal');
  const ventaTotalSucursalEl = document.getElementById('ventaTotalSucursal');
  const ventaDiariaGlobalEl = document.getElementById('ventaDiariaGlobal');
  const ventaTotalGlobalEl = document.getElementById('ventaTotalGlobal');

  const tablaSucursalesWrap = document.getElementById('tablaSucursales');
  const tablaDependientesWrap = document.getElementById('tablaDependientes');
  const tablaRegistrosDiaWrap = document.getElementById('tablaRegistrosDia');
  const resumenTopDependienteEl = document.getElementById('resumenTopDependiente');
  const top3Panel = document.getElementById('top3Panel');

  let CONFIG = {
    dependientes: [],
    sucursales: [],
    metas: {
      sucursal: {},
      metaPersonalGlobal: 0
    }
  };

  let registros = [];
  let metaGlobal = {
    updatedAt: null,
    ultimaFechaCorte: null,
    cortes: []
  };

  let fpInstance = null;
  let diasConRegistroSet = new Set();

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

  function sumBy(arr, selector) {
    return arr.reduce((acc, item) => acc + (selector(item) || 0), 0);
  }

  // ---------- Flatpickr ----------

  function initDatePicker() {
    if (typeof flatpickr === 'undefined' || !fechaFiltro) return;

    fpInstance = flatpickr(fechaFiltro, {
      dateFormat: 'Y-m-d',
      defaultDate: fechaFiltro.value || hoyISO(),
      onChange: (selectedDates, dateStr) => {
        fechaFiltro.value = dateStr;
        renderAll();
      },
      onDayCreate: (dObj, dStr, fp, dayElem) => {
        try {
          const dateObj = dayElem.dateObj;
          if (!dateObj) return;
          const y = dateObj.getFullYear();
          const m = String(dateObj.getMonth() + 1).padStart(2, '0');
          const d = String(dateObj.getDate()).padStart(2, '0');
          const iso = `${y}-${m}-${d}`;
          if (diasConRegistroSet.has(iso)) {
            dayElem.classList.add('has-record');
          }
        } catch (e) {
          // noop
        }
      }
    });
  }

  function renderDiasConRegistros() {
    diasConRegistroSet = new Set(registros.map(r => r.fecha));

    if (diasConRegistrosWrap) {
      if (!diasConRegistroSet.size) {
        diasConRegistrosWrap.textContent = 'Aún no hay ventas registradas.';
      } else {
        diasConRegistrosWrap.textContent = 'Los días con un punto azul en el calendario tienen ventas registradas.';
      }
    }

    if (fpInstance && typeof fpInstance.redraw === 'function') {
      fpInstance.redraw();
    }
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

    const depOptions = ['<option value="">Selecciona…</option>']
      .concat(CONFIG.dependientes.map(d => `<option value="${d}">${d}</option>`));
    dependienteInput.innerHTML = depOptions.join('');
    dependienteEstadoCuenta.innerHTML = depOptions.join('');

    const sucOptions = ['<option value="">Selecciona…</option>']
      .concat(CONFIG.sucursales.map(s => `<option value="${s}">${s}</option>`));
    sucursalInput.innerHTML = sucOptions.join('');

    const sucFiltroOptions = ['<option value="">Todas</option>']
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

  function renderTop3Panel(rowsStats) {
    if (!top3Panel) return;

    if (!rowsStats.length || rowsStats.every(r => r.totalDep <= 0)) {
      top3Panel.innerHTML = '<span class="text-muted text-xs">Aún no hay ventas registradas.</span>';
      return;
    }

    const top = rowsStats.slice(0, 3);

    const html = top.map((row, idx) => {
      const rank = idx + 1;
      let rankClass = 'top3-rank-1';
      if (rank === 2) rankClass = 'top3-rank-2';
      if (rank === 3) rankClass = 'top3-rank-3';
      return `
        <div class="top3-item ${rankClass}">
          <div class="top3-item-rank">${rank}</div>
          <div class="top3-item-main">
            <div class="top3-item-name">${row.dep}</div>
            <div class="top3-item-meta">${row.pct.toFixed(1)}% de su meta</div>
          </div>
          <div class="top3-item-value">${formatCurrency(row.totalDep)}</div>
        </div>
      `;
    }).join('');

    top3Panel.innerHTML = html;
  }

  function renderTablaDependientes() {
    const registrosAcum = getRegistrosAcumuladoActual();
    const metaPersonal = parseMonto(CONFIG.metas.metaPersonalGlobal ?? 0);

    const rowsStats = CONFIG.dependientes.map(dep => {
      const registrosDep = registrosAcum.filter(r => r.dependiente === dep);
      const totalDep = sumBy(registrosDep, r => r.monto);
      const pct = metaPersonal > 0 ? (totalDep / metaPersonal) * 100 : 0;

      const detalles = [];
      for (const suc of CONFIG.sucursales) {
        const totalDepSuc = sumBy(registrosDep.filter(r => r.sucursal === suc), r => r.monto);
        if (totalDepSuc <= 0) continue;
        const totalSuc = sumBy(registrosAcum.filter(r => r.sucursal === suc), r => r.monto);
        const pctSuc = totalSuc > 0 ? (totalDepSuc / totalSuc) * 100 : 0;
        detalles.push(`${suc}: ${formatCurrency(totalDepSuc)} (${pctSuc.toFixed(1)}% de la sucursal)`);
      }

      return { dep, totalDep, pct, metaPersonal, detalles };
    });

    rowsStats.sort((a, b) => b.totalDep - a.totalDep);

    if (rowsStats.length && rowsStats[0].totalDep > 0) {
      const top = rowsStats[0];
      if (resumenTopDependienteEl) {
        resumenTopDependienteEl.textContent =
          `Top actual: ${top.dep} con ${formatCurrency(top.totalDep)} (${top.pct.toFixed(1)}% de su meta personal).`;
      }
    } else if (resumenTopDependienteEl) {
      resumenTopDependienteEl.textContent = 'Aún no hay ventas registradas para mostrar ranking.';
    }

    renderTop3Panel(rowsStats);

    let html = '<table class="table table-sm align-middle mb-0">';
    html += '<thead class="table-light"><tr>';
    html += '<th class="rank-col">#</th>';
    html += '<th>Dependientx</th>';
    html += '<th class="text-end">Total / Meta</th>';
    html += '<th style="width:35%">Avance meta personal</th>';
    html += '<th class="text-xs text-muted">Detalle por sucursal</th>';
    html += '</tr></thead><tbody>';

    if (!rowsStats.length) {
      html += '<tr><td colspan="5" class="text-center text-muted py-3">Sin dependientxs configurados.</td></tr>';
    } else {
      rowsStats.forEach((row, idx) => {
        const rank = idx + 1;
        const isLeader = rank === 1;
        const pctClampVal = clamp(row.pct, 0, 100);

        let rankClass = 'rank-default';
        let medalIcon = '';
        if (rank === 1) {
          rankClass = 'rank-1';
          medalIcon = '<i class="fa-solid fa-medal text-warning me-1"></i>';
        } else if (rank === 2) {
          rankClass = 'rank-2';
          medalIcon = '<i class="fa-solid fa-medal text-secondary me-1"></i>';
        } else if (rank === 3) {
          rankClass = 'rank-3';
          medalIcon = '<i class="fa-solid fa-medal text-info me-1"></i>';
        }

        html += `<tr class="${isLeader ? 'leader-row' : ''}">`;
        html += `<td class="rank-col">
          <div class="rank-badge ${rankClass}">${rank}</div>
        </td>`;
        html += `<td class="leader-name">${medalIcon}${row.dep}</td>`;
        html += `<td class="text-end">${formatCurrency(row.totalDep)} / ${formatCurrency(row.metaPersonal)}</td>`;
        html += '<td>';
        html += `<div class="progress" role="progressbar" aria-valuenow="${pctClampVal.toFixed(1)}" aria-valuemin="0" aria-valuemax="100">`;
        html += `<div class="progress-bar ${isLeader ? 'bg-success' : 'bg-info'}" style="width:${pctClampVal.toFixed(1)}%"></div>`;
        html += '</div>';
        html += `<div class="d-flex justify-content-between text-muted progress-label mt-1">`;
        html += `<span>${row.pct.toFixed(1)}% de la meta</span>`;
        html += `<span>${formatCurrency(row.totalDep)}</span>`;
        html += '</div>';
        html += '</td>';

        html += '<td class="text-xs text-muted">';
        if (row.detalles.length) {
          html += row.detalles.map(d => `<div>${d}</div>`).join('');
        } else {
          html += '<span class="text-muted">Sin aporte por sucursal aún.</span>';
        }
        html += '</td>';

        html += '</tr>';
      });
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

    tablaRegistrosDiaWrap.querySelectorAll('.btn-eliminar-registro').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        const id = ev.currentTarget.getAttribute('data-id');
        if (!id) return;
        const resp = await Swal.fire({
          title: '¿Eliminar registro?',
          text: 'Esta acción no se puede deshacer.',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'Sí, eliminar',
          cancelButtonText: 'Cancelar'
        });
        if (!resp.isConfirmed) return;

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

  // ---------- Captura de registros ----------

  async function handleAgregarRegistro() {
    const fecha = fechaFiltro.value || hoyISO();
    const dep = dependienteInput.value;
    const suc = sucursalInput.value;
    const monto = parseMonto(montoInput.value);

    if (!dep || !suc || !monto) {
      Swal.fire('Datos incompletos', 'Selecciona dependientx, sucursal y un monto válido.', 'warning');
      return;
    }

    const nuevo = {
      id: String(Date.now()) + Math.random().toString(16).slice(2),
      fecha,
      dependiente: dep,
      sucursal: suc,
      monto
    };
    registros.push(nuevo);

    await guardarEstado();
    montoInput.value = '';
    renderAll();
  }

  // ---------- Corte mensual ----------

  async function handleCorteMensual() {
    if (!registros.length) {
      Swal.fire('Sin datos', 'No hay registros para realizar un corte.', 'info');
      return;
    }

    const resp = await Swal.fire({
      title: '¿Realizar corte mensual?',
      text: 'Se guardará un resumen del acumulado actual y se reiniciará el periodo.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, continuar',
      cancelButtonText: 'Cancelar'
    });

    if (!resp.isConfirmed) return;

    const registrosAcum = getRegistrosAcumuladoActual();
    const totalesPorSucursal = {};
    for (const suc of CONFIG.sucursales) {
      totalesPorSucursal[suc] = sumBy(registrosAcum.filter(r => r.sucursal === suc), r => r.monto);
    }

    const corte = {
      fechaCorte: hoyISO(),
      totalesPorSucursal
    };

    metaGlobal.cortes = metaGlobal.cortes || [];
    metaGlobal.cortes.push(corte);
    metaGlobal.ultimaFechaCorte = corte.fechaCorte;

    await guardarEstado();
    renderAll();

    Swal.fire('Corte realizado', 'El corte mensual se ha registrado correctamente.', 'success');
  }

  // ---------- Estado de cuenta (PDF simple) ----------

  function generarEstadoCuentaPDF(depSeleccionado) {
    if (!depSeleccionado) return;

    const registrosAcum = getRegistrosAcumuladoActual();
    const registrosDep = registrosAcum.filter(r => r.dependiente === depSeleccionado);
    if (!registrosDep.length) {
      Swal.fire('Sin datos', 'Este dependientx no tiene ventas en el periodo actual.', 'info');
      return;
    }

    const totalDep = sumBy(registrosDep, r => r.monto);
    const metaPersonal = parseMonto(CONFIG.metas.metaPersonalGlobal ?? 0);
    const pct = metaPersonal > 0 ? (totalDep / metaPersonal) * 100 : 0;

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(12);
    doc.text('TRRendimiento — Estado de cuenta', 14, 15);
    doc.setFontSize(10);
    doc.text(`Dependientx: ${depSeleccionado}`, 14, 22);
    doc.text(`Total acumulado: ${totalDep.toFixed(2)} USD`, 14, 28);
    doc.text(`Meta personal: ${metaPersonal.toFixed(2)} USD`, 14, 34);
    doc.text(`Avance: ${pct.toFixed(1)}%`, 14, 40);

    const body = registrosDep.map(r => [
      r.fecha,
      r.sucursal,
      r.monto.toFixed(2)
    ]);

    doc.autoTable({
      startY: 48,
      head: [['Fecha', 'Sucursal', 'Monto (USD)']],
      body
    });

    doc.save(`estado_cuenta_${depSeleccionado.replace(/\s+/g, '_')}.pdf`);
  }

  // ---------- Eventos ----------

  fechaFiltro.addEventListener('change', () => {
    renderAll();
  });

  sucursalFiltro.addEventListener('change', () => {
    renderAll();
  });

  btnAgregarRegistro.addEventListener('click', async () => {
    await handleAgregarRegistro();
  });

  montoInput.addEventListener('keyup', async (ev) => {
    if (ev.key === 'Enter') {
      await handleAgregarRegistro();
    }
  });

  btnCorteMensual.addEventListener('click', async () => {
    await handleCorteMensual();
  });

  btnEstadoCuentaPDF.addEventListener('click', () => {
    const dep = dependienteEstadoCuenta.value;
    if (!dep) {
      Swal.fire('Selecciona dependientx', 'Primero elige un dependientx para generar el estado de cuenta.', 'warning');
      return;
    }
    generarEstadoCuentaPDF(dep);
  });

  // ---------- Init ----------

  fechaFiltro.value = hoyISO();

  await initConfig();
  await initData();
  initDatePicker();
  renderAll();
});
