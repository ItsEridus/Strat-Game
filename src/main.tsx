import { render } from 'preact';
import { App } from './ui/App';

const root = document.getElementById('app')!;
root.innerHTML = '';
render(<App />, root);
