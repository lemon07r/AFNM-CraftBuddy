import { ModAPI } from 'afnm-types';

declare global {
  interface Window {
    modAPI: ModAPI;
  }
}

export {};
