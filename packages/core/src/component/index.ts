// @pdxui/core/component — Web Component API, services, device detection
export { PdxElement } from './element';
export { define } from './define';
export { component } from './component';
export { provide, inject, tryInject } from './context';
export { setPermissions, hasPermission, requirePermission } from './permissions';
export { responsive } from './responsive';
export { device } from './device';
export type { ComponentOptions, ComponentOptionsWithSetup, ComponentContext, PropDefinition, TypedProp, ComponentDeclarations, EventMap } from './component';
export { prop, event, model, slot } from './component-descriptor';
export type { PropType, PropSpec, PropOptions, EventSpec, ModelSpec, SlotSpec, EventDetail, EmitOf } from './component-descriptor';
export type { Breakpoint, BreakpointMap } from './responsive';
export type { DeviceType, Orientation } from './device';
