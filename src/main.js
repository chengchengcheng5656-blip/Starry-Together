import './styles/app.css';
import { siteConfig } from './config.js';
import { startApp } from './ui/app.js';

document.title = siteConfig.siteTitle;
startApp();
