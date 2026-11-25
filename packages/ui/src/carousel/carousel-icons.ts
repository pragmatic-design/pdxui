// The icons pdx-carousel draws whatever its data, on the page with it rather than loaded a frame
// late (#47). Once per page: beside the component, whose .pdx script runs at every mount. Declared
// under `sideEffects`, as the bundler must keep it.

import { defineIcons } from '../icon/icon-map';
import iconChevronLeft from '../icon/pragmatic/chevron-left';
import iconChevronRight from '../icon/pragmatic/chevron-right';
import iconPlay from '../icon/pragmatic/play';
import iconPause from '../icon/pragmatic/pause';

defineIcons({ 'chevron-left': iconChevronLeft, 'chevron-right': iconChevronRight, play: iconPlay, pause: iconPause });
