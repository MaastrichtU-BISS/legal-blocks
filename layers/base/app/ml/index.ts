// What the loader imports for vue-legal-ml-builder.
//
// The package ships no single screen: a host composes its components. This is
// that composition. There is deliberately no default export, so the loader
// installs no plugin: the builder's plugin needs an adapter at install time,
// and here the adapter comes from the binding, per mount.

export { default as MlWorkbench } from "./MlWorkbench.vue";
