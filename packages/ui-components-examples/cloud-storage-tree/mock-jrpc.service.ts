import type {
  CreateFileRequest,
  CreateFolderRequest,
  DeleteRequest,
  FileSystemNode,
  ListFolderResponse,
  MoveRequest,
  RenameRequest
} from './types';

// ============================================================================
// MARK: Mock Data
// ============================================================================

const generateId = () => Math.random().toString(36).substring(2, 15);

const createNode = (name: string, type: 'file' | 'folder', parentId: string | null, size?: number): FileSystemNode => ({
  id: generateId(),
  name,
  type,
  parentId,
  size,
  createdAt: Date.now(),
  updatedAt: Date.now()
});

// Initialize mock file system
const initializeMockData = (): Map<string, FileSystemNode> => {
  const nodes = new Map<string, FileSystemNode>();

  // Root storage
  const root = createNode('storage:', 'folder', null);
  root.id = 'root';
  nodes.set(root.id, root);

  // First level folders
  const documents = createNode('Documents', 'folder', 'root');
  const images = createNode('Images', 'folder', 'root');
  const projects = createNode('Projects', 'folder', 'root');
  const downloads = createNode('Downloads', 'folder', 'root');

  nodes.set(documents.id, documents);
  nodes.set(images.id, images);
  nodes.set(projects.id, projects);
  nodes.set(downloads.id, downloads);

  // Documents subfolder and files
  const work = createNode('Work', 'folder', documents.id);
  const personal = createNode('Personal', 'folder', documents.id);
  const resume = createNode('resume.pdf', 'file', documents.id, 245000);
  const notes = createNode('notes.txt', 'file', documents.id, 1200);

  nodes.set(work.id, work);
  nodes.set(personal.id, personal);
  nodes.set(resume.id, resume);
  nodes.set(notes.id, notes);

  // Work files
  const report = createNode('report.docx', 'file', work.id, 52000);
  const spreadsheet = createNode('budget.xlsx', 'file', work.id, 34000);
  const presentation = createNode('presentation.pptx', 'file', work.id, 1200000);

  nodes.set(report.id, report);
  nodes.set(spreadsheet.id, spreadsheet);
  nodes.set(presentation.id, presentation);

  // Images files
  const photo1 = createNode('vacation.jpg', 'file', images.id, 2400000);
  const photo2 = createNode('family.png', 'file', images.id, 1800000);
  const screenshot = createNode('screenshot.png', 'file', images.id, 450000);

  nodes.set(photo1.id, photo1);
  nodes.set(photo2.id, photo2);
  nodes.set(screenshot.id, screenshot);

  // Projects folder
  const webApp = createNode('web-app', 'folder', projects.id);
  const mobileApp = createNode('mobile-app', 'folder', projects.id);

  nodes.set(webApp.id, webApp);
  nodes.set(mobileApp.id, mobileApp);

  // Web app files
  const indexHtml = createNode('index.html', 'file', webApp.id, 5600);
  const stylesCss = createNode('styles.css', 'file', webApp.id, 12000);
  const appJs = createNode('app.js', 'file', webApp.id, 28000);

  nodes.set(indexHtml.id, indexHtml);
  nodes.set(stylesCss.id, stylesCss);
  nodes.set(appJs.id, appJs);

  // Downloads files
  const installer = createNode('installer.exe', 'file', downloads.id, 45000000);
  const archive = createNode('backup.zip', 'file', downloads.id, 12000000);

  nodes.set(installer.id, installer);
  nodes.set(archive.id, archive);

  return nodes;
};

// ============================================================================
// MARK: Mock JRPC Service
// ============================================================================

let mockNodes = initializeMockData();

// Simulate network delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to get full path of a node
const getNodePath = (nodeId: string): string => {
  const parts: string[] = [];
  let currentId: string | null = nodeId;

  while (currentId) {
    const node = mockNodes.get(currentId);
    if (node) {
      parts.unshift(node.name);
      currentId = node.parentId;
    } else {
      break;
    }
  }

  return '/' + parts.join('/');
};

// Helper to find node by path
const findNodeByPath = (path: string): FileSystemNode | null => {
  // Normalize path
  const normalizedPath = path.startsWith('/') ? path : '/' + path;

  // Handle root
  if (normalizedPath === '/' || normalizedPath === '/storage:') {
    return mockNodes.get('root') ?? null;
  }

  // Split path and traverse
  const parts = normalizedPath.split('/').filter(Boolean);
  let currentNode: FileSystemNode | null = null;

  // Start from root
  for (const part of parts) {
    if (!currentNode) {
      // Looking for root level match
      if (part === 'storage:') {
        currentNode = mockNodes.get('root') ?? null;
      } else {
        return null;
      }
    } else {
      // Looking for child with matching name
      let found = false;
      mockNodes.forEach((node) => {
        if (node.parentId === currentNode!.id && node.name === part) {
          currentNode = node;
          found = true;
        }
      });
      if (!found) {
        return null;
      }
    }
  }

  return currentNode;
};

export const mockJrpcService = {
  /**
   * Get full path of a node
   */
  getPath(nodeId: string): string {
    return getNodePath(nodeId);
  },

  /**
   * Resolve a path to a node ID
   */
  async resolvePath(path: string): Promise<string | null> {
    await delay(50);
    const node = findNodeByPath(path);
    return node?.id ?? null;
  },

  /**
   * List contents of a folder
   */
  async listFolder(folderId: string): Promise<ListFolderResponse> {
    await delay(100 + Math.random() * 200);

    const items: FileSystemNode[] = [];
    mockNodes.forEach((node) => {
      if (node.parentId === folderId) {
        // Calculate childCount for folders
        const nodeWithCount = { ...node };
        if (node.type === 'folder') {
          let count = 0;
          mockNodes.forEach((child) => {
            if (child.parentId === node.id) count++;
          });
          nodeWithCount.childCount = count;
        }
        items.push(nodeWithCount);
      }
    });

    // Sort: folders first, then files, alphabetically
    items.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    const currentNode = mockNodes.get(folderId);
    return {
      items,
      currentPath: currentNode?.name ?? '/'
    };
  },

  /**
   * Get a single node by ID
   */
  async getNode(nodeId: string): Promise<FileSystemNode | null> {
    await delay(50);
    const node = mockNodes.get(nodeId);
    return node ? { ...node } : null;
  },

  /**
   * Get breadcrumb path for a node
   */
  async getBreadcrumbs(nodeId: string): Promise<FileSystemNode[]> {
    await delay(50);
    const breadcrumbs: FileSystemNode[] = [];
    let currentId: string | null = nodeId;

    while (currentId) {
      const node = mockNodes.get(currentId);
      if (node) {
        breadcrumbs.unshift({ ...node });
        currentId = node.parentId;
      } else {
        break;
      }
    }

    return breadcrumbs;
  },

  /**
   * Create a new folder
   */
  async createFolder(request: CreateFolderRequest): Promise<FileSystemNode> {
    await delay(150 + Math.random() * 100);

    // Check for duplicate name
    let hasDuplicate = false;
    mockNodes.forEach((node) => {
      if (node.parentId === request.parentPath && node.name === request.name) {
        hasDuplicate = true;
      }
    });

    if (hasDuplicate) {
      throw new Error(`A folder named "${request.name}" already exists`);
    }

    const newFolder = createNode(request.name, 'folder', request.parentPath);
    mockNodes.set(newFolder.id, newFolder);

    return { ...newFolder };
  },

  /**
   * Create a new file
   */
  async createFile(request: CreateFileRequest): Promise<FileSystemNode> {
    await delay(150 + Math.random() * 100);

    // Check for duplicate name
    let hasDuplicate = false;
    mockNodes.forEach((node) => {
      if (node.parentId === request.parentPath && node.name === request.name) {
        hasDuplicate = true;
      }
    });

    if (hasDuplicate) {
      throw new Error(`A file named "${request.name}" already exists`);
    }

    const newFile = createNode(request.name, 'file', request.parentPath, 0);
    mockNodes.set(newFile.id, newFile);

    return { ...newFile };
  },

  /**
   * Rename a file or folder
   */
  async rename(request: RenameRequest): Promise<FileSystemNode> {
    await delay(100 + Math.random() * 100);

    const node = mockNodes.get(request.path);
    if (!node) {
      throw new Error('Item not found');
    }

    // Check for duplicate name in same folder
    let hasDuplicate = false;
    mockNodes.forEach((n) => {
      if (n.parentId === node.parentId && n.name === request.newName && n.id !== node.id) {
        hasDuplicate = true;
      }
    });

    if (hasDuplicate) {
      throw new Error(`An item named "${request.newName}" already exists`);
    }

    const updatedNode: FileSystemNode = {
      ...node,
      name: request.newName,
      updatedAt: Date.now()
    };

    mockNodes.set(node.id, updatedNode);

    return { ...updatedNode };
  },

  /**
   * Delete files or folders
   */
  async delete(request: DeleteRequest): Promise<{ deletedIds: string[] }> {
    await delay(200 + Math.random() * 150);

    const deletedIds: string[] = [];

    const deleteRecursive = (nodeId: string) => {
      // First delete all children
      mockNodes.forEach((node) => {
        if (node.parentId === nodeId) {
          deleteRecursive(node.id);
        }
      });

      // Then delete the node itself
      if (mockNodes.delete(nodeId)) {
        deletedIds.push(nodeId);
      }
    };

    for (const path of request.paths) {
      deleteRecursive(path);
    }

    return { deletedIds };
  },

  /**
   * Move files or folders
   */
  async move(request: MoveRequest): Promise<{ movedIds: string[] }> {
    await delay(150 + Math.random() * 100);

    const movedIds: string[] = [];

    for (const sourcePath of request.sourcePaths) {
      const node = mockNodes.get(sourcePath);
      if (node) {
        // Check we're not moving a folder into itself
        if (node.type === 'folder') {
          let checkId: string | null = request.destinationPath;
          while (checkId) {
            if (checkId === node.id) {
              throw new Error('Cannot move a folder into itself');
            }
            const checkNode = mockNodes.get(checkId);
            checkId = checkNode?.parentId ?? null;
          }
        }

        const updatedNode: FileSystemNode = {
          ...node,
          parentId: request.destinationPath,
          updatedAt: Date.now()
        };

        mockNodes.set(node.id, updatedNode);
        movedIds.push(node.id);
      }
    }

    return { movedIds };
  },

  /**
   * Download a file (simulated)
   */
  async downloadFile(nodeId: string, fileName: string): Promise<void> {
    await delay(100 + Math.random() * 200);

    const node = mockNodes.get(nodeId);
    if (!node) {
      throw new Error('File not found');
    }

    // Create mock file content
    const content =
      node.type === 'folder'
        ? `This is a simulated download of folder: ${fileName}`
        : `This is simulated content for file: ${fileName}\n\nFile size: ${node.size ?? 0} bytes\nCreated: ${new Date(node.createdAt).toISOString()}`;

    // Create and trigger download
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = node.type === 'folder' ? `${fileName}.txt` : fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  /**
   * Upload a file (simulated)
   */
  async uploadFile(request: { parentPath: string; name: string; size: number }): Promise<FileSystemNode> {
    await delay(200 + Math.random() * 300);

    // Check for duplicate name
    let hasDuplicate = false;
    mockNodes.forEach((node) => {
      if (node.parentId === request.parentPath && node.name === request.name) {
        hasDuplicate = true;
      }
    });

    if (hasDuplicate) {
      throw new Error(`A file named "${request.name}" already exists`);
    }

    const newFile = createNode(request.name, 'file', request.parentPath, request.size);
    mockNodes.set(newFile.id, newFile);

    return { ...newFile };
  },

  /**
   * Reset mock data (for testing)
   */
  async reset(): Promise<void> {
    await delay(50);
    mockNodes = initializeMockData();
  }
};
