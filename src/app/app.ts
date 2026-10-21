import { Component } from '@angular/core';
import { GreatWave } from './great-wave/great-wave';

@Component({
  imports: [GreatWave],
  selector: 'app-root',
  template: `<app-great-wave />`,
})
export class App {}
