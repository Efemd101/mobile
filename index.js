import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

console.disableYellowBox = true;

global.navigator.userAgent = 'ReactNative';

LogBox.ignoreLogs([
  'Warning: componentWillReceiveProps has been renamed',
  'Setting a timer for a long period of time',
  'WebSocket connection failed',
  'JavaScript logs will be removed from Metro',
  'The following packages should be updated',
  'Expected version'
]);

import App from './App';

registerRootComponent(App);
