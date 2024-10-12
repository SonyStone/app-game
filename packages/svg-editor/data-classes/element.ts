import { Subject } from "rxjs"
import { XNode } from "./x-node"
import { Attribute } from "./attribute"
import { AttributeType, getAttributeType, PercentageHandling, PROPAGATED_ATTRIBUTES, PropagatedAttribute, RECOGNIZED_ATTRIBUTES, RecognizedAttribute } from "./db"

// An SVG element, standalone (<element/>) or container (<element>...</element>).
export class Element extends XNode {

  name!: RecognizedAttribute

  attribute_changed = new Subject<string>()
  ancestor_attribute_changed = new Subject<string>()
  descendant_attribute_changed = new Subject<string>()
  
  _child_elements: Array<XNode> = []
  _attributes = new Map<string, Attribute>()  // Dictionary{string: Attribute}
  
  _init(): void {
    this.attribute_changed.subscribe(this._on_attribute_changed)
    this.ancestor_attribute_changed.subscribe(this._on_ancestor_attribute_changed)
    this.descendant_attribute_changed.subscribe(this._on_descendant_attribute_changed)
  }

  destroy(): void {
    this.attribute_changed.unsubscribe()
    this.ancestor_attribute_changed.unsubscribe()
    this.descendant_attribute_changed.unsubscribe()
  }
  
  _on_attribute_changed(attribute_name: string): void {
    for (const child of this.get_children()) {
      if (child instanceof Element) {
        child.ancestor_attribute_changed.next(attribute_name)
      }
    }
    if (this.parent) {
      this.parent.descendant_attribute_changed.next(attribute_name)
    }
    if (this.root) {
      this.root.any_attribute_changed.next(this.xid)
    }
  }
  
  _on_ancestor_attribute_changed(attribute_name: string): void {
    for (const child of this.get_children() as Element[]) {
      child.ancestor_attribute_changed.next(attribute_name)
    }
  }
  
  _on_descendant_attribute_changed(attribute_name: string): void {
    if (this.parent) {
      this.parent.descendant_attribute_changed.next(attribute_name)
    }
  }
  
  _on_attribute_value_changed(attribute: Attribute): void {
    const has_attrib = this.has_attribute(attribute.name)
    if (has_attrib && !this._attributes.get(attribute.name)?.get_value()) {
      this._attributes.delete(attribute.name)
    } else if (!has_attrib) {
      this._attributes.set(attribute.name, attribute)
    }
    this.attribute_changed.next(attribute.name)
  }
  
  
  get_children(): Array<XNode> {
    return this._child_elements
  }
  
  get_child(idx: number): XNode {
    return this._child_elements[idx]
  }
  
  has_children(): boolean {
    return this._child_elements.length !== 0
  }
  
  get_child_count(): number {
    return this._child_elements.length
  }
  
  get_all_element_descendants(): Array<Element> {
    const elements: Element[] = []
    for (const child of this.get_children()) {
      if (child instanceof Element) {
        elements.push(child)
        for (const descendant of child.get_all_element_descendants()) {
          elements.push(descendant)
        }
      }
    }
    return elements
  }
  
  get_all_xnode_descendants(): Array<XNode> {
    const xnodes: XNode[] = []
    for (const child of this.get_children()) {
      xnodes.push(child)
      if (child instanceof Element) {
        for (const descendant of child.get_all_xnode_descendants()) {
          xnodes.push(descendant)
        }
      }
    }
    return xnodes
  }
  
  
  replace_child(idx: number, new_element: XNode): void {
    const old_element = this.get_child(idx)
    this._child_elements[idx] = new_element
    if (new_element instanceof Element) {
      for (const grandchild_element of new_element.get_children()) {
        grandchild_element.parent = new_element
        if (new_element instanceof ElementSVG) {
          grandchild_element.svg = new_element
        }
      }
    }
    new_element.xid = old_element.xid
    new_element.parent = old_element.parent
    new_element.svg = old_element.svg
    new_element.root = old_element.root
  }
  
  insert_child(idx: number, new_element: XNode): void {
    if (idx < 0) {
      idx += this.get_child_count() + 1
    }
    new_element.parent = this
    new_element.root = this.root
    new_element.svg = self instanceof ElementSVG ? this : this.svg
    const new_xid = this.xid?.slice() ?? []
    // new_xid.append(idx)
    new_element.xid = new_xid
    new_element.propagate_xid_correction()

    for (let i = idx; i < this.get_child_count(); i++) {
      const child = this.get_child(i)
      child.xid?.push() // ! wtf is goin on here?
      child.propagate_xid_correction()
    }
    // add at index
    this._child_elements[idx] = new_element;
  }
  
  remove_child(idx: number): void {
    for (let i = idx + 1; i < this.get_child_count(); i++) {
      var child = this.get_child(i)
      child.xid?.pop()
      child.propagate_xid_correction()
    }
    // remove at index
    this._child_elements.splice(idx, 1)
  }
  
  pop_child(idx: number): XNode {
    for (let i = idx + 1; i < this.get_child_count(); i++) {
      var child = this.get_child(i)
      child.xid?.pop
      child.propagate_xid_correction()
    }
    const item = this._child_elements[idx]
    this._child_elements.splice(idx, 1)
    return item
  }
  
  
  propagate_xid_correction(): void {
    for (let i = 0; i < this.get_child_count(); i++) {
      var new_xid = this.xid!.slice()
      new_xid.push(i)
      var child = this.get_child(i)
      child.xid = new_xid
      child.propagate_xid_correction()
    }
  }
  
  
  has_attribute(attribute_name: string): boolean {
    return this._attributes.has(attribute_name)
  }
  
  /** If the attribute exists, gets that attribute. If it doesn't, generates it. */
  get_attribute(attribute_name: string): Attribute {
    if (this.has_attribute(attribute_name)) {
      return this._attributes.get(attribute_name)!
    }
    return this.new_attribute(attribute_name)
  }
  
  
  /** "real" determines if we want the true value or fallback on defaults. */
  get_attribute_value(attribute_name: string, real = false): string {
    if (this.has_attribute(attribute_name)) {
      return this._attributes.get(attribute_name)!.get_value()
    }
    if (real) {
      return ""
    }
    return this.get_default(attribute_name)
  }
  
  get_attribute_num(attribute_name: string): number {
    if (getAttributeType(attribute_name) !== AttributeType.NUMERIC) {
      console.error("Attribute not the correct type.")
    }
    const attrib: AttributeNumeric = this.has_attribute(attribute_name) ? this._attributes.get(attribute_name) : this.new_default_attribute(attribute_name)
    // Possibly adjust for percentage.
    const num = attrib.get_num();

    if (attrib.is_percentage()) {
      switch (this.get_percentage_handling(attribute_name)) {
        case PercentageHandling.FRACTION: return num;
        case PercentageHandling.HORIZONTAL: return this.svg.width * num;
        case PercentageHandling.VERTICAL: return this.svg.height * num
        case PercentageHandling.NORMALIZED: return this.svg.normalized_diagonal * num
      }
    }
    return num
  }
  
  is_attribute_percentage(attribute_name: string): boolean {
    if (getAttributeType(attribute_name) !== AttributeType.NUMERIC) {
      console.error("Attribute not the correct type.")
    }
    const attrib: AttributeNumeric = this.has_attribute(attribute_name) ? this._attributes.get(attribute_name) : this.new_default_attribute(attribute_name)
    return attrib.is_percentage()
  }
  
  get_attribute_rect(attribute_name: string): number {
    if (getAttributeType(attribute_name) !== AttributeType.LIST) {
      console.error("Attribute not the correct type.")
    }
    const attrib: AttributeList = this.has_attribute(attribute_name) ? this._attributes.get(attribute_name) : this.new_default_attribute(attribute_name)
    return attrib.get_rect()
  }
  
  get_attribute_list(attribute_name: string): number[] {
    if (getAttributeType(attribute_name) !== AttributeType.LIST) {
      console.error("Attribute not the correct type.")
    }
    const attrib: AttributeList = this.has_attribute(attribute_name) ? this._attributes.get(attribute_name) : this.new_default_attribute(attribute_name)
    return attrib.get_list()
  }
  
  get_attribute_commands(attribute_name: string): PathCommand[] {
    if (getAttributeType(attribute_name) !== AttributeType.PATHDATA) {
      console.error("Attribute not the correct type.")
    }
    const attrib: AttributePathdata = this.has_attribute(attribute_name) ? this._attributes.get(attribute_name): this.new_default_attribute(attribute_name)
    return attrib.get_commands()
  }
  
  get_attribute_transforms(attribute_name: string): Array[Transform] {
    if (getAttributeType(attribute_name) !== AttributeType.TRANSFORM_LIST) {
      console.error("Attribute not the correct type.")
    }
    const attrib: AttributeTransformList = this.has_attribute(attribute_name) ? this._attributes.get(attribute_name) : this.new_default_attribute(attribute_name)
    return attrib.get_transform_list()
  }
  
  get_attribute_final_transform(attribute_name: string): Transform2D {
    if (getAttributeType(attribute_name) !== AttributeType.TRANSFORM_LIST) {
      console.error("Attribute not the correct type.")
    }
    var attrib: AttributeTransformList = this.has_attribute(attribute_name) ? this._attributes.get(attribute_name) : this.new_default_attribute(attribute_name)
    return attrib.get_final_transform()
  }
  
  
   set_attribute(attribute_name: string, value: any): void {
     let attrib: Attribute
     if (this.has_attribute(attribute_name)) {
       attrib = this._attributes.get(attribute_name)
     } else {
       attrib = this.new_attribute(attribute_name)
     }
     
     var value_type = typeof value
     
     if (value_type === 'string') {
       attrib.set_value(value)
     }
     else {
       switch (getAttributeType(attribute_name)) {
         case AttributeType.NUMERIC: {
           if (value_type === 'number') {
             attrib.set_num(value)
           }
           else {
            console.error("Invalid value set to attribute.")
          }
           break
         }
         case AttributeType.LIST: {
           if (value_type  === 'object' && value.length === 4) {
            attrib.set_rect(value)
          } else if (value_type === 'object' && value.length > 0) {
            attrib.set_list(value)
          } else {
            console.error("Invalid value set to attribute.")
          } 
           break
         }
         case AttributeType.PATHDATA: {
           if (value_type === 'object' && value.length > 0) {
             attrib.set_commands(value)
           } else {
            console.error("Invalid value set to attribute.")
           }
           break
         }
         case AttributeType.TRANSFORM_LIST: {
           if (value_type === 'object' && value.length > 0) {
             attrib.set_transform_list(value)
           } else {
            console.error("Invalid value set to attribute.")
           }
           break
         }
         default: {
          console.error("Attribute not the correct type.")
          break
         }
       }
     }
   }
  
   get_default(attribute_name: string): string {
     if (PROPAGATED_ATTRIBUTES.includes(attribute_name as PropagatedAttribute)) {
       if (this.is_parent_g()) {
         return this.parent.get_attribute_value(attribute_name)
       }
       else if ( this.svg) {
         return this.svg.get_attribute_value(attribute_name)
       }
     }
     return this._get_own_default(attribute_name)
   }
  
  get_all_attributes(): IterableIterator<Attribute> {
    return this._attributes.values()
  }
  
  // ! not sure about this one
  // Why is there no way to duplicate RefCounteds, again?
  // duplicate(include_children = true): Element {
  //   var type: GDScript = get_script()
  //   var new_element: Element
  //   if type == ElementUnrecognized:
  //     new_element = ElementUnrecognized.new(self.name)
  //   else:
  //     new_element = type.new()
    
  //   if type == ElementRoot:
  //     new_element.formatter = self.formatter
    
  //   for attribute in _attributes:
  //     new_element.set_attribute(attribute, get_attribute_value(attribute))
    
  //   if include_children:
  //     for i in get_child_count():
  //       new_element.insert_child(i, get_child(i).duplicate())
  //   return new_element
  // }
  
  // Applies children and attributes to another element. Useful for conversion.
  apply_to(element: Element, dropped_attributes: string[]): void {
    element._child_elements = this._child_elements
    for (const attribute_name of this._attributes.keys()) {
      if (!dropped_attributes.includes(attribute_name)) {
        element.set_attribute(attribute_name, this.get_attribute_value(attribute_name))
      }
    }
  }
  
  // Converts all percentage numeric attributes to absolute.
  make_all_attributes_absolute(): void {
    const attributes_to_convert = [...this._attributes.keys()]
        if (RECOGNIZED_ATTRIBUTES[this.name]) {
      attributes_to_convert.push(RECOGNIZED_ATTRIBUTES[this.name] as unknown as readonly string);
    }
    for (const attribute_name of attributes_to_convert) {
      if (getAttributeType(attribute_name) === AttributeType.NUMERIC) {
        this.make_attribute_absolute(attribute_name)
      }
    }
  }
  
  // Converts a percentage numeric attribute to absolute.
  make_attribute_absolute(attribute_name: string): void {
    if is_attribute_percentage(attribute_name):
      var new_attrib := new_attribute(attribute_name)
      new_attrib.set_num(get_attribute_num(attribute_name))
      _attributes[attribute_name] = new_attrib
  }
  
  
  // To be overridden in extending classes.
  _get_own_default(_attribute_name: string): string {
    return ""
  }
  
  get_percentage_handling(attribute_name: string): DB.PercentageHandling {
    return DB.get_attribute_default_percentage_handling(attribute_name)
  }
  
  can_replace(_new_element: string): bool {
    return false
  }
  
  get_replacement(_new_element: string): Element {
    return null
  }
  
  get_config_warnings(): PackedstringArray {
    var warnings := PackedstringArray()
    var own_name: string = self.name
    if parent != null and not DB.is_child_element_valid(parent.name, own_name):
      warnings.append(TranslationServer.translate("{element} must be inside {allowed} to have any effect.").format(
          {"element": own_name, "allowed": "[%s]" % ", ".join(DB.get_valid_parents(own_name))}))
    return warnings
  }
  
  user_setup(_what = null): void {
    return
  }
  
  
  // Helpers
  is_parent_g(): boolean {
    return parent != null and parent is ElementG
  }
  
  get_transform(): Transform2D {
    var result := Transform2D.IDENTITY
    if is_parent_g():
      result *= parent.get_transform()
    if has_attribute("transform"):
      result *= get_attribute_final_transform("transform")
    return result
  }
  
  new_attribute(name: string, value = ""): Attribute {
    var attrib := _create_attribute(name, value)
    attrib.value_changed.connect(_on_attribute_value_changed.bind(attrib))
    return attrib
  }
  
  new_default_attribute(name: string): Attribute {
    return _create_attribute(name, get_default(name))
  }
  
  _create_attribute(name: string, value = ""): Attribute {
    return attribute(name, root.formatter if root != null else Formatter.new(), value)
  }
}

