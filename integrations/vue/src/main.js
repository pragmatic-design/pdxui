import { createApp } from 'vue';
import '@pdxui/design';            // design tokens + component CSS
import '@pdxui/ui';                // registers all <pdx-*> custom elements (side-effect)
import App from './App.vue';

createApp(App).mount('#app');
