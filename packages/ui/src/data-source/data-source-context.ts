// The context token a <pdx-data-source> provides its DataSource under (#495): the nearest one above a
// list, a pagination, an infinite scroll, a select or an autocomplete is the one they read. In a
// module of its own so the consumers import the token without registering <pdx-data-source>.

import { context, type DataSource } from '@pdxui/core';

/** The DataSource of the nearest `<pdx-data-source>` above. Inject it with `inject(DataSourceContext, el, null)`. */
export const DataSourceContext = context<DataSource<Record<string, unknown>>>('data-source');
