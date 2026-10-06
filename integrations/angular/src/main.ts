import 'zone.js';
import '@angular/compiler';   // enable Angular JIT (compile @Component templates at runtime)
import '@pdxui/design';   // CSS
import '@pdxui/ui';       // registers <pdx-*> custom elements
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app.component';

bootstrapApplication(AppComponent).catch((err) => console.error(err));
