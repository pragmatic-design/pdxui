// pdx-banner's icons, registered when the component is imported: it draws them whatever its data, on
// the page with it rather than loaded a frame late (#47). Beside the component, not in its .pdx
// script, which runs at every mount (#1210).
import { defineIcons } from '../icon/icon-map';
import iconInfo from '../icon/pragmatic/info';
import iconCheckCircle from '../icon/pragmatic/check-circle';
import iconAlertTriangle from '../icon/pragmatic/alert-triangle';
import iconAlertCircle from '../icon/pragmatic/alert-circle';

defineIcons({ info: iconInfo, 'check-circle': iconCheckCircle, 'alert-triangle': iconAlertTriangle, 'alert-circle': iconAlertCircle });
