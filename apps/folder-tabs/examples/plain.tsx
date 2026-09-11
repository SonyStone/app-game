import { render } from '@solidjs/web';
import { Notebook } from './Notebook';
import styles from './plain.module.css';

render(() => <Notebook />, document.getElementById('root')!);

// The standalone entry owns the document baseline; routed consumers only style their wrapper.
document.body.classList.add(styles.page!);
