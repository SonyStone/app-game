import { Subject } from 'rxjs';
import { Formatter } from '../config-classes/formatter';

// Represents an attribute inside an element, i.e. <element attribute="value"/>.
// If the Attribute's data type is known, one of the inheriting classes should be used.
export class Attribute {
  value_changed = new Subject<void>();

  name!: string;
  formatter!: Formatter;
  _value!: string;

  set_value(new_value: string): void {
    const proposed_new_value = this.format(new_value);
    if (proposed_new_value !== this._value) {
      this._value = proposed_new_value;
      this._sync();
      this.value_changed.next();
    }
  }

  get_value(): string {
    return this._value;
  }

  _sync(): void {
    // pass
  }

  format(text: string): string {
    return text;
  }

  _init(new_name: string, new_formatter: Formatter, init_value = ''): void {
    this.name = new_name;
    this.formatter = new_formatter;
    this.set_value(init_value);
  }
}
