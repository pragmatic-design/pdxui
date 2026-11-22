// pdx-search-input's glyph, registered when the field is imported: it draws it whatever its data, on
// the page with it rather than loaded a frame late (#47). Beside the component, not in its .pdx script,
// which runs at every mount (#1210).
import { defineIcons } from '../icon/icon-map';
import iconSearch from '../icon/pragmatic/search';

defineIcons({ search: iconSearch });
