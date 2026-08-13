import { createApp } from "vue";
import App from "./App.vue";
import { setHostApp } from "./modules/loaders";
import "./style.css";

const app = createApp(App);

// Modules are loaded on demand, long after this point, and some of them ship a
// Vue plugin that has to be applied to an application. This is how they reach
// one.
setHostApp(app);

app.mount("#app");
