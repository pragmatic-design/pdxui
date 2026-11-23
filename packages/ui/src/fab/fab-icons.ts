// pdx-fab's default icon, registered when the component is imported: it draws it whatever its data,
// on the page with it rather than loaded a frame late (#47). Beside the component, not in its .pdx
// script, which runs at every mount (#1210).
import { defineIcons } from '../icon/icon-map';
import iconPlus from '../icon/pragmatic/plus';

defineIcons({ plus: iconPlus });
