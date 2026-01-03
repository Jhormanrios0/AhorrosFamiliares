import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import router from "./router";

import Multiselect from "@vueform/multiselect";
import "@vueform/multiselect/themes/default.css";

createApp(App).component("Multiselect", Multiselect).use(router).mount("#app");
