// The customers the server starts with, as names by id.
//
// In its own module, with no imports: the tickets' seed names its customers from here, and the
// ticket seed is read by the board, which must not carry the customers store to do it.

/**
 * Customer `id`'s name is `CUSTOMER_NAMES[id - 1]`. Twenty-four, each once: the seed cycled twelve,
 * so «Northwind Traders» was customer 1 and customer 13. The first twelve keep their places.
 */
export const CUSTOMER_NAMES: string[] = [
    'Northwind Traders', 'Contoso Manufacturing', 'Fabrikam Logistics', 'Adventure Works',
    'Tailspin Toys', 'Litware Consulting', 'Proseware Health', 'Wide World Importers',
    'Fourth Coffee', 'Graphic Design Institute', 'Lucerne Publishing', 'Trey Research',
    'Wingtip Paper', 'Woodgrove Bank', 'Alpine Ski House', 'Blue Yonder Airlines',
    'Coho Vineyard', 'Margie\'s Travel', 'City Power & Light', 'School of Fine Art',
    'Consolidated Messenger', 'Humongous Insurance', 'Southridge Video', 'VanArsdel Ltd',
];
