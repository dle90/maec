// LinkRad PACS — runtime extras for OHIF
// Loaded after app-config.js. Adds Vietnamese i18n, LINKRAD branding,
// and bridges custom toolbar buttons to bundled Cornerstone3D tools.
(function () {
  'use strict';

  // ---- Vietnamese translations (extends OHIF defaults) ----
  // OHIF ships with en-US only; we add 'vi' at runtime via i18next.
  var viResources = {
    Buttons: {
      Zoom: 'Phóng to',
      Pan: 'Di chuyển',
      'Window Level': 'Cửa sổ / Mức',
      'Reset View': 'Đặt lại',
      Length: 'Đo chiều dài',
      Angle: 'Đo góc',
      'Cobb Angle': 'Góc Cobb',
      Bidirectional: 'Đo hai chiều',
      'Elliptical ROI': 'Hình elip',
      'Circle ROI': 'Hình tròn',
      'Rectangle ROI': 'Hình chữ nhật',
      'Planar Freehand ROI': 'Đa giác (vẽ tự do)',
      Capture: 'Chụp ảnh',
      Layout: 'Bố cục',
      'More Tools': 'Công cụ khác',
      MPR: 'Tái tạo đa mặt phẳng',
      Crosshairs: 'Kính ngắm chéo',
      Cine: 'Phát ảnh động',
      Magnify: 'Kính lúp',
      Rotate: 'Xoay',
      Flip: 'Lật',
      Invert: 'Đảo màu',
      Calibration: 'Hiệu chuẩn',
    },
    Header: {
      About: 'Giới thiệu',
      Preferences: 'Tùy chọn',
      'Logout': 'Đăng xuất',
    },
    Modals: {
      Cancel: 'Hủy',
      Save: 'Lưu',
      Close: 'Đóng',
      OK: 'Đồng ý',
    },
    StudyList: {
      'Study List': 'Danh sách ca chụp',
      'Patient Name': 'Tên bệnh nhân',
      'Patient ID': 'Mã BN',
      'Study Date': 'Ngày chụp',
      'Modality': 'Phương thức',
      'Description': 'Mô tả',
      'Accession': 'Số tiếp nhận',
      'Search': 'Tìm kiếm',
      'No studies available': 'Không có ca chụp nào',
    },
    SidePanel: {
      'Study List': 'Danh sách ca',
      'Measurements': 'Phép đo',
      'Series': 'Chuỗi ảnh',
    },
    MeasurementTable: {
      Measurements: 'Danh sách phép đo',
      Description: 'Mô tả',
      'Export CSV': 'Xuất CSV',
      'Create Report': 'Tạo báo cáo',
    },
    Common: {
      Loading: 'Đang tải...',
      'No data': 'Không có dữ liệu',
    },
  };

  function tryAddVietnamese() {
    // i18next is exposed globally in OHIF v3 builds
    var i18n = window.i18next || (window.OHIF && window.OHIF.i18n);
    if (!i18n || typeof i18n.addResourceBundle !== 'function') return false;
    Object.keys(viResources).forEach(function (ns) {
      i18n.addResourceBundle('vi', ns, viResources[ns], true, true);
    });
    if (typeof i18n.changeLanguage === 'function') {
      i18n.changeLanguage('vi');
    }
    return true;
  }

  // i18next loads asynchronously; poll briefly until it's ready
  var attempts = 0;
  var maxAttempts = 50; // ~10s at 200ms
  var iv = setInterval(function () {
    attempts++;
    if (tryAddVietnamese() || attempts >= maxAttempts) {
      clearInterval(iv);
    }
  }, 200);

  // ---- LINKRAD branding overlay ----
  // Adds a small fixed badge in the top-right corner of the viewer
  function addBrandingBadge() {
    if (document.getElementById('linkrad-brand-badge')) return;
    var badge = document.createElement('div');
    badge.id = 'linkrad-brand-badge';
    badge.textContent = 'LINKRAD PACS';
    badge.style.cssText = [
      'position: fixed',
      'top: 4px',
      'right: 12px',
      'z-index: 9999',
      'font-family: system-ui, sans-serif',
      'font-size: 11px',
      'font-weight: 600',
      'letter-spacing: 0.5px',
      'color: #5acce6',
      'opacity: 0.7',
      'pointer-events: none',
      'user-select: none',
    ].join(';');
    document.body.appendChild(badge);
  }
  if (document.body) {
    addBrandingBadge();
  } else {
    document.addEventListener('DOMContentLoaded', addBrandingBadge);
  }

  // ===========================================================================
  // Custom tools (Cardiothoracic Ratio, Spine Labeling, Spine Balance)
  // Custom commands (pseudo-color cycle, image alignment)
  // Floating side panel (prior studies timeline)
  // ===========================================================================

  var VERTEBRA_LABELS = [
    'C1','C2','C3','C4','C5','C6','C7',
    'T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12',
    'L1','L2','L3','L4','L5','S1'
  ];
  var COLORMAP_CYCLE = ['Grayscale', 'hot_iron', 'Rainbow', 'hsv'];

  // Per-toolGroup vertebra-label counter (resets per toolGroup)
  var spineLabelCounters = {};

  function getSpineLabelCallback(toolGroupId) {
    return function (callback /*, eventDetails */) {
      var idx = spineLabelCounters[toolGroupId] || 0;
      var label = VERTEBRA_LABELS[idx % VERTEBRA_LABELS.length];
      spineLabelCounters[toolGroupId] = idx + 1;
      callback(label);
    };
  }

  // Cardiothoracic ratio text: long axis = thoracic, short axis = cardiac
  function ctrTextLines(data) {
    try {
      var stats = data && (data.cachedStats || (data.data && data.data.cachedStats));
      if (!stats) return ['CTR: --'];
      var key = Object.keys(stats)[0];
      if (!key) return ['CTR: --'];
      var s = stats[key];
      var thoracic = Math.max(s.length || 0, s.width || 0);
      var cardiac  = Math.min(s.length || 0, s.width || 0);
      if (!thoracic || !cardiac) return ['CTR: --'];
      var ratio = (cardiac / thoracic).toFixed(2);
      return [
        'CTR: ' + ratio,
        'Cardiac: '  + cardiac.toFixed(1)  + ' mm',
        'Thoracic: ' + thoracic.toFixed(1) + ' mm',
      ];
    } catch (e) { return ['CTR: --']; }
  }

  // Spine balance text: horizontal offset (sagittal vertical axis)
  function svaTextLines(data) {
    try {
      var stats = data && (data.cachedStats || (data.data && data.data.cachedStats));
      var handles = data && data.data && data.data.handles && data.data.handles.points;
      if (!handles || handles.length < 2) return ['SVA: --'];
      var dx = Math.abs(handles[1][0] - handles[0][0]);
      var dy = Math.abs(handles[1][1] - handles[0][1]);
      var len = stats && stats[Object.keys(stats)[0]] && stats[Object.keys(stats)[0]].length;
      var lines = ['SVA Δx: ' + dx.toFixed(1), 'Δy: ' + dy.toFixed(1)];
      if (len) lines.push('L: ' + len.toFixed(1) + ' mm');
      return lines;
    } catch (e) { return ['SVA: --']; }
  }

  function registerCustomTools() {
    var cst = window.cornerstoneTools;
    if (!cst || !cst.addTool || !cst.ToolGroupManager) return false;

    // Subclass existing tools so we keep all the click/drag/render plumbing.
    if (!cst._linkradToolsRegistered) {
      try {
        var Bidi  = cst.BidirectionalTool;
        var Arrow = cst.ArrowAnnotateTool;
        var Len   = cst.LengthTool;
        if (!Bidi || !Arrow || !Len) return false;

        var CTR = class CardiothoracicRatioTool extends Bidi {};
        CTR.toolName = 'CardiothoracicRatio';

        var SL = class SpineLabelingTool extends Arrow {};
        SL.toolName = 'SpineLabeling';

        var SB = class SpineBalanceTool extends Len {};
        SB.toolName = 'SpineBalance';

        cst.addTool(CTR);
        cst.addTool(SL);
        cst.addTool(SB);
        cst._linkradToolsRegistered = true;
        // eslint-disable-next-line no-console
        console.log('[LinkRad] Custom tools registered: CardiothoracicRatio, SpineLabeling, SpineBalance');
      } catch (e) {
        console.warn('[LinkRad] Failed to register custom tools:', e);
        return false;
      }
    }

    // Add to every existing toolGroup (idempotent — addTool on existing throws, swallow it)
    var groups = [];
    try { groups = cst.ToolGroupManager.getAllToolGroups() || []; } catch (e) {}
    groups.forEach(function (tg) {
      if (!tg || tg._linkradToolsAdded) return;
      try { tg.addTool('CardiothoracicRatio', { getTextLines: ctrTextLines }); } catch (e) {}
      try { tg.addTool('SpineLabeling',       { getTextCallback: getSpineLabelCallback(tg.id) }); } catch (e) {}
      try { tg.addTool('SpineBalance',        { getTextLines: svaTextLines }); } catch (e) {}
      tg._linkradToolsAdded = true;
    });
    return true;
  }

  // ----- Pseudo color cycle (per active viewport) -----
  var colormapIndex = {};
  function cyclePseudoColor() {
    try {
      var svc = window.services && window.services.cornerstoneViewportService;
      var grid = window.services && window.services.viewportGridService;
      var displaySetSvc = window.services && window.services.displaySetService;
      if (!svc || !grid) return;
      var state = grid.getState && grid.getState();
      var activeId = state && state.activeViewportId;
      if (!activeId) return;
      var idx = colormapIndex[activeId] || 0;
      var next = (idx + 1) % COLORMAP_CYCLE.length;
      var colormap = COLORMAP_CYCLE[next];
      colormapIndex[activeId] = next;

      var viewportInfo = state.viewports && (state.viewports.get ? state.viewports.get(activeId) : state.viewports[activeId]);
      var displaySetInstanceUIDs = (viewportInfo && viewportInfo.displaySetInstanceUIDs) || [];
      var dsUID = displaySetInstanceUIDs[0];

      window.commandsManager.run({
        commandName: 'setViewportColormap',
        commandOptions: {
          viewportId: activeId,
          displaySetInstanceUID: dsUID,
          colormap: { name: colormap },
          immediate: true,
        },
        context: 'CORNERSTONE',
      });
      console.log('[LinkRad] Pseudo color →', colormap);
    } catch (e) { console.warn('[LinkRad] cyclePseudoColor failed', e); }
  }

  // ----- Image alignment across viewports -----
  function alignImages(opts) {
    try {
      var mode = (opts && opts.mode) || 'center';
      var grid = window.services && window.services.viewportGridService;
      var svc = window.services && window.services.cornerstoneViewportService;
      if (!grid || !svc) return;
      var state = grid.getState();
      var ids = [];
      if (state && state.viewports) {
        if (typeof state.viewports.forEach === 'function') {
          state.viewports.forEach(function (_, id) { ids.push(id); });
        } else {
          ids = Object.keys(state.viewports);
        }
      }
      ids.forEach(function (id) {
        var vp = svc.getCornerstoneViewport(id);
        if (!vp) return;
        var canvas = vp.canvas;
        var img = vp.getImageData ? vp.getImageData() : null;
        if (!canvas || !img || !img.dimensions) return;
        var imgWidth  = img.dimensions[0];
        var canvasW = canvas.clientWidth || canvas.width;
        if (!canvasW || !imgWidth) return;
        // Compute pan in canvas units (cornerstone3D pan units depend on viewport — use a heuristic)
        var halfDelta = (canvasW - imgWidth) / 2;
        var panX = 0;
        if (mode === 'left'      || mode === 'lockLeft')  panX = -halfDelta;
        else if (mode === 'right'|| mode === 'lockRight') panX =  halfDelta;
        else                                              panX = 0;
        try {
          if (typeof vp.setPan === 'function') {
            var current = (vp.getPan && vp.getPan()) || [0, 0];
            vp.setPan([panX, current[1]]);
            vp.render();
          }
        } catch (e) {}
      });
      console.log('[LinkRad] Aligned viewports →', mode);
      // Lock variants: re-run on stack/image change
      if (mode === 'lockLeft' || mode === 'lockRight') {
        window._linkradAlignLock = mode;
      } else {
        window._linkradAlignLock = null;
      }
    } catch (e) { console.warn('[LinkRad] alignImages failed', e); }
  }

  function registerCustomCommands() {
    var cm = window.commandsManager;
    if (!cm || !cm.registerCommand) return false;
    if (cm._linkradCommandsRegistered) return true;
    try {
      cm.registerCommand('CORNERSTONE', 'cyclePseudoColor', { commandFn: cyclePseudoColor });
      cm.registerCommand('CORNERSTONE', 'alignImages',      { commandFn: alignImages });
      cm._linkradCommandsRegistered = true;
      console.log('[LinkRad] Custom commands registered: cyclePseudoColor, alignImages');
      return true;
    } catch (e) {
      console.warn('[LinkRad] Failed to register commands:', e);
      return false;
    }
  }

  // ===========================================================================
  // Floating "Prior Studies" timeline panel
  // Pulls from /wado QIDO-RS, shows other studies for the current patient.
  // ===========================================================================
  var TIMELINE_ID = 'linkrad-timeline-panel';

  function buildTimelinePanel() {
    if (document.getElementById(TIMELINE_ID)) return;
    var p = document.createElement('div');
    p.id = TIMELINE_ID;
    p.style.cssText = [
      'position: fixed',
      'left: 8px',
      'bottom: 8px',
      'width: 220px',
      'max-height: 40vh',
      'overflow-y: auto',
      'background: rgba(20,28,36,0.92)',
      'border: 1px solid #1f2937',
      'border-radius: 6px',
      'padding: 8px',
      'z-index: 9998',
      'font-family: system-ui, sans-serif',
      'font-size: 11px',
      'color: #cbd5e1',
      'box-shadow: 0 4px 16px rgba(0,0,0,0.4)',
    ].join(';');
    p.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
      '  <strong style="color:#5acce6;font-size:11px;letter-spacing:0.5px;">CA CHỤP CŨ</strong>' +
      '  <button id="linkrad-timeline-close" style="background:none;border:none;color:#94a3b8;cursor:pointer;font-size:14px;line-height:1;">×</button>' +
      '</div>' +
      '<div id="linkrad-timeline-body" style="font-size:11px;">Đang tải...</div>';
    document.body.appendChild(p);
    document.getElementById('linkrad-timeline-close').onclick = function () {
      p.style.display = 'none';
    };
  }

  function getCurrentPatientID() {
    // Read from URL: /viewer?StudyInstanceUIDs=... — we still need PatientID
    // Try the OHIF DisplaySetService first
    try {
      var dss = window.services && window.services.displaySetService;
      if (dss && dss.getActiveDisplaySets) {
        var sets = dss.getActiveDisplaySets() || [];
        if (sets[0] && sets[0].instances && sets[0].instances[0]) {
          return sets[0].instances[0].PatientID;
        }
      }
    } catch (e) {}
    return null;
  }

  function refreshTimeline() {
    var body = document.getElementById('linkrad-timeline-body');
    if (!body) return;
    var pid = getCurrentPatientID();
    if (!pid) { body.textContent = 'Chưa có ca chụp.'; return; }
    fetch('/wado/studies?PatientID=' + encodeURIComponent(pid) + '&includefield=StudyDescription,ModalitiesInStudy,NumberOfStudyRelatedSeries', {
      headers: { Accept: 'application/dicom+json' },
    })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (studies) {
        if (!studies || !studies.length) { body.textContent = 'Không có ca chụp cũ.'; return; }
        var rows = studies.map(function (s) {
          var date  = (s['00080020'] && s['00080020'].Value && s['00080020'].Value[0]) || '';
          var desc  = (s['00081030'] && s['00081030'].Value && s['00081030'].Value[0]) || '(no description)';
          var mods  = (s['00080061'] && s['00080061'].Value && s['00080061'].Value.join(',')) || '';
          var uid   = (s['0020000D'] && s['0020000D'].Value && s['0020000D'].Value[0]) || '';
          var pretty = date ? (date.slice(0,4)+'-'+date.slice(4,6)+'-'+date.slice(6,8)) : '';
          return '<a href="/viewer?StudyInstanceUIDs=' + uid + '" target="_blank" '
            + 'style="display:block;padding:6px;margin-bottom:4px;border:1px solid #334155;border-radius:4px;color:#cbd5e1;text-decoration:none;background:#0f172a;">'
            + '<div style="color:#5acce6;font-weight:600;">' + pretty + ' <span style="float:right;color:#94a3b8;">' + mods + '</span></div>'
            + '<div style="color:#cbd5e1;margin-top:2px;font-size:10px;">' + desc + '</div>'
            + '</a>';
        });
        body.innerHTML = rows.join('');
      })
      .catch(function () { body.textContent = 'Lỗi khi tải ca chụp.'; });
  }

  // ----- Boot loop: poll until OHIF runtime is ready -----
  var bootAttempts = 0;
  var bootTimer = setInterval(function () {
    bootAttempts++;
    var hasTools = window.cornerstoneTools && window.cornerstoneTools.addTool;
    var hasCmds  = window.commandsManager && window.commandsManager.registerCommand;
    if (hasTools && hasCmds) {
      registerCustomTools();
      registerCustomCommands();
      buildTimelinePanel();
      refreshTimeline();
      // Continue trying to attach tools to newly created toolGroups for ~30s
      if (bootAttempts > 150) clearInterval(bootTimer);
    } else if (bootAttempts > 200) {
      clearInterval(bootTimer);
    }
  }, 200);

  // Refresh timeline whenever URL changes (study switch)
  var lastHref = location.href;
  setInterval(function () {
    if (location.href !== lastHref) {
      lastHref = location.href;
      setTimeout(refreshTimeline, 1500); // give OHIF time to load the new study
    }
  }, 1000);
})();
