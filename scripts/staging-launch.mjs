import path from 'node:path';

/** Build launch arguments once for the launcher and its regression tests. */
export function stagingLaunch(root, inherited = process.env) {
  const env = Object.fromEntries(Object.entries(inherited).filter(([key]) => !/^(?:ELECTRON_RUN_AS_NODE|NIBBLE_SMOKE|NIBBLE_SCREENSHOT|NIBBLE_DEV_URL|NIBBLE_DATA_DIR|NIBBLE_CHANNEL)$/i.test(key)));
  env.NIBBLE_DATA_DIR = path.join(root, '.nibble-staging', 'data');
  env.NIBBLE_CHANNEL = 'staging';
  return {
    args: [path.join(root, '.nibble-staging', 'app'), '--enable-logging=file', `--log-file=${path.join(root, '.nibble-staging', 'electron-startup.log')}`],
    options: { cwd: root, stdio: 'inherit', windowsHide: true, env },
  };
}
