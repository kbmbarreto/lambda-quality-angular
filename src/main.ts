import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { applyTheme, storedTheme } from './app/core/browser-preferences';

applyTheme(document, storedTheme(document) ?? 'LAMBDA');

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
