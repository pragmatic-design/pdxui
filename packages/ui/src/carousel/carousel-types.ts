// pdx-carousel's public types, beside the component: a .pdx file exports its element, and an app
// that builds its slides in TypeScript imports this shape from `@pdxui/ui/carousel`.

export interface CarouselItem {
    src?: string;
    alt?: string;
    content?: string;
    caption?: string;
}
