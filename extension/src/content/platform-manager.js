import { log } from './logger.js';

import { platform as amediateka } from '../platforms/amediateka.js';
import { platform as ivi } from '../platforms/ivi.js';
import { platform as kinopoisk } from '../platforms/kinopoisk.js';
import { platform as kion } from '../platforms/kion.js';
import { platform as premier } from '../platforms/premier.js';
import { platform as viju } from '../platforms/viju.js';
import { platform as wink } from '../platforms/wink.js';
import { platform as generic } from '../platforms/generic.js';

const PLATFORMS = [kinopoisk, ivi, kion, wink, premier, amediateka, viju, generic];

export function getPlatformForLocation(locationLike = window.location) {
  const url = String(locationLike?.href || '');
  const hostname = String(locationLike?.hostname || '');

  for (const p of PLATFORMS) {
    try {
      if (p.matches({ url, hostname })) {
        log('platform selected', p.id);
        return p;
      }
    } catch {
      // ignore platform errors; keep selection robust
    }
  }

  return generic;
}