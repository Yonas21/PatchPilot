export function workbenchDemo(candidate = false) {
  return {
    name: 'patchpilot-remediation-demo',
    lockfileVersion: 3,
    packages: {
      '': {
        name: 'patchpilot-remediation-demo',
        version: '1.0.0',
        dependencies: { lodash: '4.17.20', minimist: candidate ? '1.2.8' : '1.2.5' },
      },
      'node_modules/lodash': { version: '4.17.20' },
      'node_modules/minimist': { version: candidate ? '1.2.8' : '1.2.5' },
    },
  };
}
