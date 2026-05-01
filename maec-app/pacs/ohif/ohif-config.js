// LinkRad PACS — OHIF Viewer config
// Customizations: W/L presets, hotkeys, color LUTs, branding
window.config = {
  routerBasename: '/',
  extensions: [],
  modes: [],
  showStudyList: true,
  maxNumberOfWebWorkers: 3,
  showWarningMessageForCrossOrigin: false,
  showCPUFallbackMessage: true,
  showLoadingIndicator: true,
  strictZSpacingForVolumeViewport: true,
  defaultDataSourceName: 'dicomweb',

  // LinkRad branding (consumed by linkrad-extras.js)
  whiteLabeling: {
    createLogoComponentFn: function (React) {
      return React.createElement('span', {
        className: 'text-primary-active text-base font-bold ml-2',
        style: { letterSpacing: '0.5px' },
      }, 'LINKRAD PACS')
    },
  },

  // Default UI language (Vietnamese added at runtime in linkrad-extras.js)
  i18n: {
    lng: 'vi',
    fallbackLng: 'en-US',
  },

  // Override built-in W/L presets to match LinkRad legacy viewer
  // Keys 2-6 in the hotkeys array map to presets 1-5 below
  customizationService: [
    {
      id: 'cornerstone.windowLevelPresets',
      presets: {
        CT: {
          1: { description: 'Preset 1 (80/40)', window: '80', level: '40' },
          2: { description: 'Preset 2 (160/80)', window: '160', level: '80' },
          3: { description: 'Preset 3 (256/128)', window: '256', level: '128' },
          4: { description: 'Preset 4 (320/160)', window: '320', level: '160' },
          5: { description: 'Preset 5 (640/320)', window: '640', level: '320' },
        },
        MR: {
          1: { description: 'Preset 1 (80/40)', window: '80', level: '40' },
          2: { description: 'Preset 2 (160/80)', window: '160', level: '80' },
          3: { description: 'Preset 3 (256/128)', window: '256', level: '128' },
          4: { description: 'Preset 4 (320/160)', window: '320', level: '160' },
          5: { description: 'Preset 5 (640/320)', window: '640', level: '320' },
        },
        XA: {
          1: { description: 'Preset 1 (80/40)', window: '80', level: '40' },
          2: { description: 'Preset 2 (160/80)', window: '160', level: '80' },
          3: { description: 'Preset 3 (256/128)', window: '256', level: '128' },
          4: { description: 'Preset 4 (320/160)', window: '320', level: '160' },
          5: { description: 'Preset 5 (640/320)', window: '640', level: '320' },
        },
        CR: {
          1: { description: 'Preset 1 (80/40)', window: '80', level: '40' },
          2: { description: 'Preset 2 (160/80)', window: '160', level: '80' },
          3: { description: 'Preset 3 (256/128)', window: '256', level: '128' },
          4: { description: 'Preset 4 (320/160)', window: '320', level: '160' },
          5: { description: 'Preset 5 (640/320)', window: '640', level: '320' },
        },
        DX: {
          1: { description: 'Preset 1 (80/40)', window: '80', level: '40' },
          2: { description: 'Preset 2 (160/80)', window: '160', level: '80' },
          3: { description: 'Preset 3 (256/128)', window: '256', level: '128' },
          4: { description: 'Preset 4 (320/160)', window: '320', level: '160' },
          5: { description: 'Preset 5 (640/320)', window: '640', level: '320' },
        },
      },
    },
  ],

  // Hotkeys — extends OHIF defaults; overrides where keys collide
  hotkeys: [
    // W/L presets (key 1 = invert as pseudo-color stand-in, keys 2-6 = presets)
    { commandName: 'invertViewport', label: 'Pseudo Color (Invert)', keys: ['1'], isEditable: true },
    { commandName: 'setWindowLevel', commandOptions: { window: '80',  level: '40'  }, label: 'W/L Preset 1 (80/40)',   keys: ['2'], context: 'CORNERSTONE', isEditable: true },
    { commandName: 'setWindowLevel', commandOptions: { window: '160', level: '80'  }, label: 'W/L Preset 2 (160/80)',  keys: ['3'], context: 'CORNERSTONE', isEditable: true },
    { commandName: 'setWindowLevel', commandOptions: { window: '256', level: '128' }, label: 'W/L Preset 3 (256/128)', keys: ['4'], context: 'CORNERSTONE', isEditable: true },
    { commandName: 'setWindowLevel', commandOptions: { window: '320', level: '160' }, label: 'W/L Preset 4 (320/160)', keys: ['5'], context: 'CORNERSTONE', isEditable: true },
    { commandName: 'setWindowLevel', commandOptions: { window: '640', level: '320' }, label: 'W/L Preset 5 (640/320)', keys: ['6'], context: 'CORNERSTONE', isEditable: true },

    // Measurement tool hotkeys matching legacy viewer
    { commandName: 'setToolActive', commandOptions: { toolName: 'Angle' },              label: 'Angle',                keys: ['a'], isEditable: true },
    { commandName: 'setToolActive', commandOptions: { toolName: 'CobbAngle' },          label: 'Cobb Angle',           keys: ['shift+c'], isEditable: true },
    { commandName: 'setToolActive', commandOptions: { toolName: 'CircleROI' },          label: 'Circle ROI',           keys: ['o'], isEditable: true },
    { commandName: 'setToolActive', commandOptions: { toolName: 'EllipticalROI' },      label: 'Ellipse ROI',          keys: ['e'], isEditable: true },
    { commandName: 'setToolActive', commandOptions: { toolName: 'RectangleROI' },       label: 'Rectangle ROI',        keys: ['shift+r'], isEditable: true },
    { commandName: 'setToolActive', commandOptions: { toolName: 'PlanarFreehandROI' },  label: 'Polygon ROI',          keys: ['p'], isEditable: true },
    { commandName: 'setToolActive', commandOptions: { toolName: 'SplineROI' },          label: 'Spline ROI',           keys: ['shift+s'], isEditable: true },
    { commandName: 'setToolActive', commandOptions: { toolName: 'LivewireContour' },    label: 'Livewire',             keys: ['shift+w'], isEditable: true },
    { commandName: 'setToolActive', commandOptions: { toolName: 'Length' },             label: 'Length',               keys: ['shift+l'], isEditable: true },
    { commandName: 'setToolActive', commandOptions: { toolName: 'Bidirectional' },      label: 'Bidirectional',        keys: ['b'], isEditable: true },
    { commandName: 'setToolActive', commandOptions: { toolName: 'ArrowAnnotate' },      label: 'Label / Annotation',   keys: ['t'], isEditable: true },
    { commandName: 'setToolActive', commandOptions: { toolName: 'Probe' },              label: 'Probe',                keys: ['shift+x'], isEditable: true },
    { commandName: 'setToolActive', commandOptions: { toolName: 'Magnify' },            label: 'Magnify',              keys: ['m'], isEditable: true },
    { commandName: 'setToolActive', commandOptions: { toolName: 'CalibrationLine' },    label: 'Calibration',          keys: ['shift+k'], isEditable: true },
    { commandName: 'setToolActive', commandOptions: { toolName: 'UltrasoundDirectional' }, label: 'US Directional',     keys: ['shift+u'], isEditable: true },

    // Custom tools (registered at runtime by linkrad-extras.js)
    { commandName: 'setToolActive', commandOptions: { toolName: 'CardiothoracicRatio' }, label: 'Cardiothoracic Ratio', keys: ['shift+t'], isEditable: true },
    { commandName: 'setToolActive', commandOptions: { toolName: 'SpineLabeling' },       label: 'Spine Labeling',       keys: ['shift+v'], isEditable: true },
    { commandName: 'setToolActive', commandOptions: { toolName: 'SpineBalance' },        label: 'Spine Balance',        keys: ['shift+b'], isEditable: true },

    // Pseudo color cycle (overrides invertViewport on key 1)
    { commandName: 'cyclePseudoColor', label: 'Cycle Pseudo Color', keys: ['shift+1'], context: 'CORNERSTONE', isEditable: true },

    // Image alignment across viewports
    { commandName: 'alignImages', commandOptions: { mode: 'left' },      label: 'Align Left',       keys: ['shift+left'],  context: 'CORNERSTONE', isEditable: true },
    { commandName: 'alignImages', commandOptions: { mode: 'right' },     label: 'Align Right',      keys: ['shift+right'], context: 'CORNERSTONE', isEditable: true },
    { commandName: 'alignImages', commandOptions: { mode: 'center' },    label: 'Align Center',     keys: ['shift+down'],  context: 'CORNERSTONE', isEditable: true },
    { commandName: 'alignImages', commandOptions: { mode: 'lockLeft' },  label: 'Align & Lock Left', keys: ['ctrl+shift+left'],  context: 'CORNERSTONE', isEditable: true },
    { commandName: 'alignImages', commandOptions: { mode: 'lockRight' }, label: 'Align & Lock Right', keys: ['ctrl+shift+right'], context: 'CORNERSTONE', isEditable: true },

    // Series synchronization (granular toggles)
    { commandName: 'toggleSynchronizer', commandOptions: { type: 'imageSlice' }, label: 'Sync Scroll Position', keys: ['s'], isEditable: true },

    // Cine playback
    { commandName: 'toggleCine', label: 'Toggle Cine', keys: ['shift+p'] },
  ],

  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        friendlyName: 'LinkRad PACS',
        name: 'orthanc',
        wadoUriRoot: '/wado',
        qidoRoot: '/wado',
        wadoRoot: '/wado',
        qidoSupportsIncludeField: false,
        supportsReject: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        dicomUploadEnabled: false,
        omitQuotationForMultipartRequest: true,
      },
    },
  ],
};
