import { useTheme } from "@base/composables/useTheme";

export default defineNuxtPlugin(() => {
  const { init } = useTheme();
  init();
});
