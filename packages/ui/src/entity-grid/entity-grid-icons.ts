// The icons pdx-entity-grid draws whatever its data, registered when the component is imported: on the
// page with it rather than loaded a frame late (#47). Beside the component, not in its .pdx script,
// which runs at every mount (#1210).
import { defineIcons } from '../icon/icon-map';
import iconPlus from '../icon/pragmatic/plus';
import iconPencil from '../icon/pragmatic/pencil';
import iconTrash from '../icon/pragmatic/trash';

defineIcons({ plus: iconPlus, pencil: iconPencil, trash: iconTrash });
