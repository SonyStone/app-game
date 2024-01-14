import { FBXTree } from './fbx-tree';
import * as Utils from './utils';

export function fbxTextParser(text: string) {
  let currentIndent = 0;

  const allNodes = new FBXTree();
  const nodeStack: any[] = [];
  let currentProp: any[] = [];
  let currentPropName = '';

  function getPrevNode() {
    return nodeStack[currentIndent - 2];
  }

  function getCurrentNode() {
    return nodeStack[currentIndent - 1];
  }

  function getCurrentProp() {
    return currentProp;
  }

  function pushStack(node: Node) {
    nodeStack.push(node);
    currentIndent += 1;
  }

  function popStack() {
    nodeStack.pop();
    currentIndent -= 1;
  }

  function setCurrentProp(val: any[], name: string) {
    currentProp = val;
    currentPropName = name;
  }

  interface Node {
    name: string;
    id?: number;
    attrName?: string;
    attrType?: string;
    PoseNode?: Node[];
    [key: string]: any;
  }

  function parseNodeBegin(line: string, property: any[]) {
    const nodeName = property[1].trim().replace(/^"/, '').replace(/"$/, '');

    const nodeAttrs = property[2].split(',').map(function (attr: string) {
      return attr.trim().replace(/^"/, '').replace(/"$/, '');
    });

    const node: Node = { name: nodeName };
    const attrs = parseNodeAttr(nodeAttrs);

    const currentNode = getCurrentNode();

    // a top node
    if (currentIndent === 0) {
      allNodes.add(nodeName, node);
    } else {
      // a subnode

      // if the subnode already exists, append it
      if (nodeName in currentNode) {
        // special case Pose needs PoseNodes as an array
        if (nodeName === 'PoseNode') {
          currentNode.PoseNode!.push(node);
        } else if (currentNode[nodeName].id !== undefined) {
          currentNode[nodeName] = {};
          currentNode[nodeName][currentNode[nodeName].id] =
            currentNode[nodeName];
        }

        if (attrs.id !== '') currentNode[nodeName][attrs.id] = node;
      } else if (typeof attrs.id === 'number') {
        currentNode[nodeName] = {};
        currentNode[nodeName][attrs.id] = node;
      } else if (nodeName !== 'Properties70') {
        if (nodeName === 'PoseNode') currentNode[nodeName] = [node];
        else currentNode[nodeName] = node;
      }
    }

    if (typeof attrs.id === 'number') {
      node.id = attrs.id;
    }
    if (attrs.name !== '') {
      node.attrName = attrs.name;
    }
    if (attrs.type !== '') {
      node.attrType = attrs.type;
    }

    pushStack(node);
  }

  function parseNodeAttr(attrs: any[]) {
    let id = attrs[0];

    if (attrs[0] !== '') {
      id = parseInt(attrs[0]);

      if (isNaN(id)) {
        id = attrs[0];
      }
    }

    let name = '',
      type = '';

    if (attrs.length > 1) {
      name = attrs[1].replace(/^(\w+)::/, '');
      type = attrs[2];
    }

    return { id: id, name: name, type: type };
  }

  function parseNodeProperty(
    line: string,
    property: any[],
    contentLine: string
  ) {
    let propName = property[1].replace(/^"/, '').replace(/"$/, '').trim();
    let propValue = property[2].replace(/^"/, '').replace(/"$/, '').trim();

    // for special case: base64 image data follows "Content: ," line
    //	Content: ,
    //	 "/9j/4RDaRXhpZgAATU0A..."
    if (propName === 'Content' && propValue === ',') {
      propValue = contentLine.replace(/"/g, '').replace(/,$/, '').trim();
    }

    const currentNode = getCurrentNode();
    const parentName = currentNode.name;

    if (parentName === 'Properties70') {
      parseNodeSpecialProperty(line, propName, propValue);
      return;
    }

    // Connections
    if (propName === 'C') {
      const connProps = propValue.split(',').slice(1);
      const from = parseInt(connProps[0]);
      const to = parseInt(connProps[1]);

      let rest = propValue.split(',').slice(3);

      rest = rest.map(function (elem: string) {
        return elem.trim().replace(/^"/, '');
      });

      propName = 'connections';
      propValue = [from, to];
      Utils.append(propValue, rest);

      if (currentNode[propName] === undefined) {
        currentNode[propName] = [];
      }
    }

    // Node
    if (propName === 'Node') currentNode.id = propValue;

    // connections
    if (propName in currentNode && Array.isArray(currentNode[propName])) {
      currentNode[propName].push(propValue);
    } else {
      if (propName !== 'a') currentNode[propName] = propValue;
      else currentNode.a = propValue;
    }

    setCurrentProp(currentNode, propName);

    // convert string to array, unless it ends in ',' in which case more will be added to it
    if (propName === 'a' && propValue.slice(-1) !== ',') {
      currentNode.a = Utils.parseNumberArray(propValue);
    }
  }

  function parseNodePropertyContinued(line: string) {
    const currentNode = getCurrentNode();

    currentNode.a += line;

    // if the line doesn't end in ',' we have reached the end of the property value
    // so convert the string to an array
    if (line.slice(-1) !== ',') {
      currentNode.a = Utils.parseNumberArray(currentNode.a);
    }
  }

  // parse "Property70"
  function parseNodeSpecialProperty(
    line: string,
    propName: string,
    propValue: any
  ) {
    // split this
    // P: "Lcl Scaling", "Lcl Scaling", "", "A",1,1,1
    // into array like below
    // ["Lcl Scaling", "Lcl Scaling", "", "A", "1,1,1" ]
    const props = propValue.split('",').map(function (prop: string) {
      return prop.trim().replace(/^\"/, '').replace(/\s/, '_');
    });

    const innerPropName = props[0];
    const innerPropType1 = props[1];
    const innerPropType2 = props[2];
    const innerPropFlag = props[3];
    let innerPropValue = props[4];

    // cast values where needed, otherwise leave as strings
    switch (innerPropType1) {
      case 'int':
      case 'enum':
      case 'bool':
      case 'ULongLong':
      case 'double':
      case 'Number':
      case 'FieldOfView':
        innerPropValue = parseFloat(innerPropValue);
        break;

      case 'Color':
      case 'ColorRGB':
      case 'Vector3D':
      case 'Lcl_Translation':
      case 'Lcl_Rotation':
      case 'Lcl_Scaling':
        innerPropValue = Utils.parseNumberArray(innerPropValue);
        break;
    }

    // CAUTION: these props must append to parent's parent
    getPrevNode()[innerPropName] = {
      type: innerPropType1,
      type2: innerPropType2,
      flag: innerPropFlag,
      value: innerPropValue,
    };

    setCurrentProp(getPrevNode(), innerPropName);
  }

  const split = text.split(/[\r\n]+/);

  split.forEach(function (line: string, i) {
    const matchComment = line.match(/^[\s\t]*;/);
    const matchEmpty = line.match(/^[\s\t]*$/);

    if (matchComment || matchEmpty) return;

    const matchBeginning = line.match(
      '^\\t{' + currentIndent + '}(\\w+):(.*){'
    );
    const matchProperty = line.match(
      '^\\t{' + currentIndent + '}(\\w+):[\\s\\t\\r\\n](.*)'
    );
    const matchEnd = line.match('^\\t{' + (currentIndent - 1) + '}}');

    if (matchBeginning) {
      parseNodeBegin(line, matchBeginning);
    } else if (matchProperty) {
      parseNodeProperty(line, matchProperty, split[++i]);
    } else if (matchEnd) {
      popStack();
    } else if (line.match(/^[^\s\t}]/)) {
      // large arrays are split over multiple lines terminated with a ',' character
      // if this is encountered the line needs to be joined to the previous line
      parseNodePropertyContinued(line);
    }
  });

  return allNodes;
}
