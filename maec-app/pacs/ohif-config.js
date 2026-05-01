window.config = {
  routerBasename: '/',
  showStudyList: true,
  showWarningMessageForCrossOrigin: false,
  showCPUFallbackMessage: false,
  strictZSpacingForVolumeViewport: true,

  // ── Data Sources ──────────────────────────────────────
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomweb',
      sourceName: 'dicomweb',
      configuration: {
        friendlyName: 'LinkRad Orthanc',
        name: 'orthanc',
        wadoUriRoot: window.location.origin + '/wado',
        qidoRoot: window.location.origin + '/wado',
        wadoRoot: window.location.origin + '/wado',
        qidoSupportsIncludeField: false,
        imageRendering: 'wadors',
        thumbnailRendering: 'wadors',
        enableStudyLazyLoad: true,
        supportsFuzzyMatching: false,
        supportsWildcard: true,
        dicomUploadEnabled: true,
        omitQuotationForMultipartRequest: true,
      },
    },
  ],
  defaultDataSourceName: 'dicomweb',

  // ── Window/Level Presets ──────────────────────────────
  // OHIF v3 reads these per-modality W/L presets from customizationService
  customizationService: {
    // W/L presets shown in the toolbar dropdown, organized by modality
    'cornerstoneViewportService.windowLevelPresets': {
      CT: [
        { description: 'Não (Brain)', window: '80', level: '40' },
        { description: 'Xương (Bone)', window: '2500', level: '480' },
        { description: 'Phổi (Lung)', window: '1500', level: '-600' },
        { description: 'Mô mềm (Soft Tissue)', window: '400', level: '50' },
        { description: 'Bụng (Abdomen)', window: '400', level: '60' },
        { description: 'Gan (Liver)', window: '150', level: '30' },
        { description: 'Trung thất (Mediastinum)', window: '350', level: '50' },
        { description: 'Đột quỵ (Stroke)', window: '8', level: '32' },
        { description: 'Mạch máu (Vascular)', window: '600', level: '170' },
      ],
      MR: [
        { description: 'Mặc định (Default)', window: '400', level: '200' },
        { description: 'T1 Não (T1 Brain)', window: '600', level: '300' },
        { description: 'T2 Não (T2 Brain)', window: '1000', level: '500' },
        { description: 'Cột sống (Spine)', window: '600', level: '300' },
        { description: 'Khớp (Joint)', window: '500', level: '250' },
      ],
      CR: [
        { description: 'Mặc định (Default)', window: '2048', level: '1024' },
        { description: 'Ngực (Chest)', window: '4096', level: '1024' },
        { description: 'Xương (Bone)', window: '2048', level: '512' },
      ],
      DX: [
        { description: 'Mặc định (Default)', window: '2048', level: '1024' },
        { description: 'Ngực (Chest)', window: '4096', level: '1024' },
        { description: 'Xương (Bone)', window: '2048', level: '512' },
      ],
      US: [
        { description: 'Mặc định (Default)', window: '255', level: '128' },
      ],
      PT: [
        { description: 'Mặc định (Default)', window: '30000', level: '15000' },
      ],
    },
  },

  // ── Hotkeys ───────────────────────────────────────────
  hotkeys: [
    { commandName: 'incrementActiveViewport', label: 'Next Viewport', keys: ['right'] },
    { commandName: 'decrementActiveViewport', label: 'Previous Viewport', keys: ['left'] },
    { commandName: 'rotateViewportCW', label: 'Rotate CW', keys: ['r'] },
    { commandName: 'flipViewportHorizontal', label: 'Flip H', keys: ['h'] },
    { commandName: 'flipViewportVertical', label: 'Flip V', keys: ['v'] },
    { commandName: 'scaleUpViewport', label: 'Zoom In', keys: ['+'] },
    { commandName: 'scaleDownViewport', label: 'Zoom Out', keys: ['-'] },
    { commandName: 'fitViewportToWindow', label: 'Fit Screen', keys: ['='] },
    { commandName: 'resetViewport', label: 'Reset', keys: ['space'] },
    { commandName: 'toggleCine', label: 'Toggle Cine', keys: ['c'] },
    { commandName: 'invertViewport', label: 'Invert', keys: ['i'] },
    // W/L preset hotkeys for CT
    { commandName: 'windowLevelPreset1', label: 'W/L: Brain', keys: ['1'] },
    { commandName: 'windowLevelPreset2', label: 'W/L: Bone', keys: ['2'] },
    { commandName: 'windowLevelPreset3', label: 'W/L: Lung', keys: ['3'] },
    { commandName: 'windowLevelPreset4', label: 'W/L: Soft Tissue', keys: ['4'] },
    { commandName: 'windowLevelPreset5', label: 'W/L: Abdomen', keys: ['5'] },
    { commandName: 'windowLevelPreset6', label: 'W/L: Liver', keys: ['6'] },
    { commandName: 'windowLevelPreset7', label: 'W/L: Mediastinum', keys: ['7'] },
    { commandName: 'windowLevelPreset8', label: 'W/L: Stroke', keys: ['8'] },
    { commandName: 'windowLevelPreset9', label: 'W/L: Vascular', keys: ['9'] },
  ],

  // ── Hanging Protocol Module Config ────────────────────
  // OHIF v3 default mode reads these — controls auto-layout per modality
  // The @ohif/extension-default hanging protocol service uses protocolMatchingRules
  // to match studies and apply viewport layouts automatically
  hangingProtocolModule: [
    // ── CT: 2-panel (axial + coronal/sagittal) ──
    {
      id: '@ohif/hp-ct',
      protocol: {
        id: 'ct-layout',
        name: 'CT 2-Panel',
        protocolMatchingRules: [
          {
            id: 'ct-modality',
            weight: 1,
            attribute: 'ModalitiesInStudy',
            constraint: { contains: ['CT'] },
          },
        ],
        stages: [
          {
            id: 'ct-stage',
            name: 'CT',
            viewportStructure: {
              layoutType: 'grid',
              properties: { rows: 1, columns: 2 },
            },
            viewports: [
              {
                viewportOptions: { allowUnmatchedView: true },
                displaySets: [
                  {
                    seriesMatchingRules: [
                      { attribute: 'Modality', constraint: { equals: { value: 'CT' } }, required: true },
                    ],
                  },
                ],
              },
              {
                viewportOptions: { allowUnmatchedView: true },
                displaySets: [
                  {
                    seriesMatchingRules: [
                      { attribute: 'Modality', constraint: { equals: { value: 'CT' } }, required: true },
                    ],
                    matchedDisplaySetsIndex: 1,
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    // ── MRI: 2x2 four-panel ──
    {
      id: '@ohif/hp-mr',
      protocol: {
        id: 'mri-layout',
        name: 'MRI 4-Panel',
        protocolMatchingRules: [
          {
            id: 'mr-modality',
            weight: 1,
            attribute: 'ModalitiesInStudy',
            constraint: { contains: ['MR'] },
          },
        ],
        stages: [
          {
            id: 'mri-stage',
            name: 'MRI',
            viewportStructure: {
              layoutType: 'grid',
              properties: { rows: 2, columns: 2 },
            },
            viewports: [
              {
                viewportOptions: { allowUnmatchedView: true },
                displaySets: [
                  {
                    seriesMatchingRules: [
                      { attribute: 'Modality', constraint: { equals: { value: 'MR' } }, required: true },
                    ],
                  },
                ],
              },
              {
                viewportOptions: { allowUnmatchedView: true },
                displaySets: [
                  {
                    seriesMatchingRules: [
                      { attribute: 'Modality', constraint: { equals: { value: 'MR' } }, required: true },
                    ],
                    matchedDisplaySetsIndex: 1,
                  },
                ],
              },
              {
                viewportOptions: { allowUnmatchedView: true },
                displaySets: [
                  {
                    seriesMatchingRules: [
                      { attribute: 'Modality', constraint: { equals: { value: 'MR' } }, required: true },
                    ],
                    matchedDisplaySetsIndex: 2,
                  },
                ],
              },
              {
                viewportOptions: { allowUnmatchedView: true },
                displaySets: [
                  {
                    seriesMatchingRules: [
                      { attribute: 'Modality', constraint: { equals: { value: 'MR' } }, required: true },
                    ],
                    matchedDisplaySetsIndex: 3,
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    // ── XR / CR / DX: single viewport ──
    {
      id: '@ohif/hp-xr',
      protocol: {
        id: 'xr-layout',
        name: 'X-Ray Single',
        protocolMatchingRules: [
          {
            id: 'xr-modality-cr',
            weight: 1,
            attribute: 'ModalitiesInStudy',
            constraint: { contains: ['CR'] },
          },
        ],
        stages: [
          {
            id: 'xr-stage',
            name: 'XR',
            viewportStructure: {
              layoutType: 'grid',
              properties: { rows: 1, columns: 1 },
            },
            viewports: [
              {
                viewportOptions: { allowUnmatchedView: true },
                displaySets: [
                  {
                    seriesMatchingRules: [
                      { attribute: 'Modality', constraint: { equals: { value: 'CR' } } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    {
      id: '@ohif/hp-dx',
      protocol: {
        id: 'dx-layout',
        name: 'DX Single',
        protocolMatchingRules: [
          {
            id: 'dx-modality',
            weight: 1,
            attribute: 'ModalitiesInStudy',
            constraint: { contains: ['DX'] },
          },
        ],
        stages: [
          {
            id: 'dx-stage',
            name: 'DX',
            viewportStructure: {
              layoutType: 'grid',
              properties: { rows: 1, columns: 1 },
            },
            viewports: [
              {
                viewportOptions: { allowUnmatchedView: true },
                displaySets: [
                  {
                    seriesMatchingRules: [
                      { attribute: 'Modality', constraint: { equals: { value: 'DX' } } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    // ── US: single viewport ──
    {
      id: '@ohif/hp-us',
      protocol: {
        id: 'us-layout',
        name: 'Ultrasound',
        protocolMatchingRules: [
          {
            id: 'us-modality',
            weight: 1,
            attribute: 'ModalitiesInStudy',
            constraint: { contains: ['US'] },
          },
        ],
        stages: [
          {
            id: 'us-stage',
            name: 'US',
            viewportStructure: {
              layoutType: 'grid',
              properties: { rows: 1, columns: 1 },
            },
            viewports: [
              {
                viewportOptions: { allowUnmatchedView: true },
                displaySets: [
                  {
                    seriesMatchingRules: [
                      { attribute: 'Modality', constraint: { equals: { value: 'US' } } },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  ],
};
