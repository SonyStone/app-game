import { Show, For, createSignal, createMemo, createEffect } from 'solid-js';
import { AbrParser, AbrWriter, createAbrFile, type AbrFileWithMeta, type BrushWithPreview, brushTipToPngBlob, downloadAbrFile } from '~/lib/abr';
import { DropZone } from '~/components/DropZone';
import { BrushCard } from '~/components/BrushCard';
import { BrushDetailEditable } from '~/components/BrushDetailEditable';
import { SearchBar } from '~/components/SearchBar';
import { FileList } from '~/components/FileList';
import { BrushEditor } from '~/components/BrushEditor';

type LoadedFile {
  name: string;
  data: AbrFileWithMeta;
  isModified?: boolean;
}

export default function Home() {
  const [files, setFiles] = createSignal<LoadedFile[]>([]);
  const [selectedFileName, setSelectedFileName] = createSignal<string | null>(null);
  const [selectedBrush, setSelectedBrush] = createSignal<BrushWithPreview | null>(null);
  const [editingBrush, setEditingBrush] = createSignal<BrushWithPreview | null>(null);
  const [isCreatingBrush, setIsCreatingBrush] = createSignal(false);
  const [searchQuery, setSearchQuery] = createSignal('');
  const [loading, setLoading] = createSignal(false);
  const [viewMode, setViewMode] = createSignal<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = createSignal<'name' | 'type' | 'diameter'>('name');

  // Get the currently selected file's data
  const selectedFile = createMemo(() => {
    const name = selectedFileName();
    if (!name) return null;
    return files().find(f => f.name === name) || null;
  });

  // Get filtered and sorted brushes
  const filteredBrushes = createMemo(() => {
    const file = selectedFile();
    if (!file) return [];

    let brushes = [...file.data.brushes];

    // Filter by search query
    const query = searchQuery().toLowerCase();
    if (query) {
      brushes = brushes.filter(brush =>
        brush.name.toLowerCase().includes(query) ||
        brush.type.toLowerCase().includes(query) ||
        brush.id.toLowerCase().includes(query)
      );
    }

    // Sort
    const sort = sortBy();
    brushes.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'type':
          return a.type.localeCompare(b.type);
        case 'diameter':
          return (b.diameter || 0) - (a.diameter || 0);
        default:
          return 0;
      }
    });

    return brushes;
  });

  // Auto-select first file when files change
  createEffect(() => {
    const allFiles = files();
    if (allFiles.length > 0 && !selectedFileName()) {
      setSelectedFileName(allFiles[0].name);
    }
  });

  const handleFilesDropped = async (droppedFiles: File[]) => {
    setLoading(true);

    try {
      const parser = new AbrParser();
      const newFiles: LoadedFile[] = [];

      for (const file of droppedFiles) {
        try {
          const buffer = await file.arrayBuffer();
          const result = parser.parse(buffer) as AbrFileWithMeta;
          result.fileName = file.name;

          newFiles.push({
            name: file.name,
            data: result,
          });
        } catch (err) {
          console.error(`Error parsing ${file.name}:`, err);
        }
      }

      if (newFiles.length > 0) {
        setFiles(prev => [...prev, ...newFiles]);
        setSelectedFileName(newFiles[0].name);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFile = (name: string) => {
    setFiles(prev => prev.filter(f => f.name !== name));
    if (selectedFileName() === name) {
      const remaining = files().filter(f => f.name !== name);
      setSelectedFileName(remaining.length > 0 ? remaining[0].name : null);
    }
  };

  const handleDownloadImage = async (brush: BrushWithPreview) => {
    if (!brush.brushTip) return;

    try {
      const blob = await brushTipToPngBlob(brush.brushTip);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sanitizeFilename(brush.name)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download image:', err);
    }
  };

  const handleDownloadAllImages = async () => {
    const file = selectedFile();
    if (!file) return;

    const brushesWithTips = file.data.brushes.filter(b => b.brushTip);
    for (const brush of brushesWithTips) {
      await handleDownloadImage(brush);
      // Small delay between downloads
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };

  const handleDownloadJson = () => {
    const file = selectedFile();
    if (!file) return;

    // Create a clean version without raw image data
    const exportData = {
      ...file.data,
      brushes: file.data.brushes.map(brush => ({
        ...brush,
        brushTip: brush.brushTip
          ? { width: brush.brushTip.width, height: brush.brushTip.height, depth: brush.brushTip.depth }
          : undefined,
        imageDataUrl: undefined,
      })),
    };

    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${file.name.replace('.abr', '')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // === EDITING FUNCTIONS ===

  const handleCreateNewFile = () => {
    const newFile: LoadedFile = {
      name: `New Brushes ${files().length + 1}.abr`,
      data: createAbrFile([]),
      isModified: true,
    };
    setFiles(prev => [...prev, newFile]);
    setSelectedFileName(newFile.name);
  };

  const handleCreateBrush = () => {
    if (!selectedFileName()) {
      // Create a new file first if none exists
      handleCreateNewFile();
    }
    setIsCreatingBrush(true);
    setEditingBrush(null);
  };

  const handleEditBrush = (brush: BrushWithPreview) => {
    setEditingBrush(brush);
    setIsCreatingBrush(false);
    setSelectedBrush(null);
  };

  const handleSaveBrush = (brush: BrushWithPreview) => {
    const fileName = selectedFileName();
    if (!fileName) return;

    setFiles(prev => prev.map(file => {
      if (file.name !== fileName) return file;

      let updatedBrushes: BrushWithPreview[];
      if (isCreatingBrush()) {
        // Add new brush
        updatedBrushes = [...file.data.brushes, brush];
      } else {
        // Update existing brush
        updatedBrushes = file.data.brushes.map(b =>
          b.id === brush.id ? brush : b
        );
      }

      return {
        ...file,
        data: { ...file.data, brushes: updatedBrushes },
        isModified: true,
      };
    }));

    setEditingBrush(null);
    setIsCreatingBrush(false);
  };

  const handleDeleteBrush = (brush: BrushWithPreview) => {
    const fileName = selectedFileName();
    if (!fileName) return;

    if (!confirm(`Delete brush "${brush.name}"?`)) return;

    setFiles(prev => prev.map(file => {
      if (file.name !== fileName) return file;
      return {
        ...file,
        data: {
          ...file.data,
          brushes: file.data.brushes.filter(b => b.id !== brush.id),
        },
        isModified: true,
      };
    }));

    setSelectedBrush(null);
  };

  const handleDuplicateBrush = (brush: BrushWithPreview) => {
    const fileName = selectedFileName();
    if (!fileName) return;

    const newBrush: BrushWithPreview = {
      ...brush,
      id: `brush_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `${brush.name} (Copy)`,
    };

    setFiles(prev => prev.map(file => {
      if (file.name !== fileName) return file;
      const brushIndex = file.data.brushes.findIndex(b => b.id === brush.id);
      const newBrushes = [...file.data.brushes];
      newBrushes.splice(brushIndex + 1, 0, newBrush);
      return {
        ...file,
        data: { ...file.data, brushes: newBrushes },
        isModified: true,
      };
    }));
  };

  const handleExportAbr = () => {
    const file = selectedFile();
    if (!file) return;

    const writer = new AbrWriter();
    const abrData = writer.write(file.data);
    downloadAbrFile(abrData, file.name);
  };

  const handleRenameFile = (oldName: string, newName: string) => {
    if (!newName.endsWith('.abr')) {
      newName = newName + '.abr';
    }
    setFiles(prev => prev.map(file => 
      file.name === oldName ? { ...file, name: newName, isModified: true } : file
    ));
    if (selectedFileName() === oldName) {
      setSelectedFileName(newName);
    }
  };

  const sampledCount = createMemo(() =>
    selectedFile()?.data.brushes.filter(b => b.type === 'sampled').length || 0
  );

  const computedCount = createMemo(() =>
    selectedFile()?.data.brushes.filter(b => b.type === 'computed').length || 0
  );

  return (
    <div class="min-h-screen bg-ps-bg-dark">
      {/* Header */}
      <header class="bg-ps-bg border-b border-ps-border sticky top-0 z-40">
        <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 bg-ps-accent rounded flex items-center justify-center">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </div>
            <div>
              <h1 class="text-lg font-semibold text-ps-text-bright">ABR Editor</h1>
              <p class="text-xs text-ps-text-muted">Photoshop Brush File Editor</p>
            </div>
          </div>

          <div class="flex items-center gap-2">
            {/* Create new file button - always visible */}
            <button
              onClick={handleCreateNewFile}
              class="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded flex items-center gap-2"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              New File
            </button>

            <Show when={files().length > 0}>
              {/* Add brush button */}
              <button
                onClick={handleCreateBrush}
                class="px-3 py-1.5 text-sm bg-ps-accent hover:bg-ps-accent-hover text-white rounded flex items-center gap-2"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                Add Brush
              </button>

              {/* Export ABR */}
              <button
                onClick={handleExportAbr}
                class="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded flex items-center gap-2"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export ABR
              </button>

              {/* JSON export */}
              <button
                onClick={handleDownloadJson}
                class="px-3 py-1.5 text-sm bg-ps-bg-light hover:bg-ps-bg-lighter text-ps-text rounded flex items-center gap-2"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                JSON
              </button>

              {/* All PNGs */}
              <button
                onClick={handleDownloadAllImages}
                class="px-3 py-1.5 text-sm bg-ps-bg-light hover:bg-ps-bg-lighter text-ps-text rounded flex items-center gap-2"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                PNGs
              </button>
            </Show>
          </div>
        </div>
      </header>

      <main class="max-w-7xl mx-auto px-4 py-6">
        {/* Loading overlay */}
        <Show when={loading()}>
          <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div class="bg-ps-bg rounded-lg p-6 flex items-center gap-4">
              <svg class="w-6 h-6 animate-spin text-ps-accent" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span class="text-ps-text">Parsing brushes...</span>
            </div>
          </div>
        </Show>

        {/* No files state */}
        <Show when={files().length === 0}>
          <div class="max-w-2xl mx-auto">
            <div class="text-center mb-8">
              <h2 class="text-2xl font-bold text-ps-text-bright mb-2">
                Adobe Photoshop Brush Viewer
              </h2>
              <p class="text-ps-text-muted">
                Drop your .abr files to preview brush tips, parameters, and export images
              </p>
            </div>

            <DropZone onFilesDropped={handleFilesDropped} multiple />

            <div class="mt-8 grid grid-cols-3 gap-4 text-center">
              <div class="p-4 bg-ps-bg rounded-lg">
                <div class="w-10 h-10 mx-auto mb-2 bg-ps-bg-light rounded-full flex items-center justify-center">
                  <svg class="w-5 h-5 text-ps-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
                  </svg>
                </div>
                <p class="text-sm text-ps-text-muted">Preview brush tips</p>
              </div>
              <div class="p-4 bg-ps-bg rounded-lg">
                <div class="w-10 h-10 mx-auto mb-2 bg-ps-bg-light rounded-full flex items-center justify-center">
                  <svg class="w-5 h-5 text-ps-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <p class="text-sm text-ps-text-muted">View parameters</p>
              </div>
              <div class="p-4 bg-ps-bg rounded-lg">
                <div class="w-10 h-10 mx-auto mb-2 bg-ps-bg-light rounded-full flex items-center justify-center">
                  <svg class="w-5 h-5 text-ps-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </div>
                <p class="text-sm text-ps-text-muted">Export as PNG</p>
              </div>
            </div>
          </div>
        </Show>

        {/* Files loaded state */}
        <Show when={files().length > 0}>
          <div class="flex gap-6">
            {/* Sidebar */}
            <aside class="w-72 flex-shrink-0 space-y-4">
              {/* Drop zone mini */}
              <DropZone
                onFilesDropped={handleFilesDropped}
                multiple
              />

              {/* File list */}
              <div>
                <h3 class="text-sm font-medium text-ps-text-muted mb-2 uppercase tracking-wider">
                  Loaded Files ({files().length})
                </h3>
                <FileList
                  files={files()}
                  selectedFile={selectedFileName()}
                  onSelectFile={setSelectedFileName}
                  onRemoveFile={handleRemoveFile}
                />
              </div>

              {/* File stats */}
              <Show when={selectedFile()}>
                <div class="bg-ps-bg rounded-lg p-4 space-y-3">
                  <h3 class="text-sm font-medium text-ps-text-muted uppercase tracking-wider">
                    File Info
                  </h3>
                  <div class="space-y-2 text-sm">
                    <div class="flex justify-between">
                      <span class="text-ps-text-muted">Version</span>
                      <span class="text-ps-text">v{selectedFile()!.data.version}.{selectedFile()!.data.subVersion}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-ps-text-muted">Total Brushes</span>
                      <span class="text-ps-text">{selectedFile()!.data.brushes.length}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-ps-text-muted">Sampled</span>
                      <span class="text-blue-400">{sampledCount()}</span>
                    </div>
                    <div class="flex justify-between">
                      <span class="text-ps-text-muted">Computed</span>
                      <span class="text-purple-400">{computedCount()}</span>
                    </div>
                  </div>

                  {/* Errors */}
                  <Show when={selectedFile()!.data.errors.length > 0}>
                    <div class="pt-3 border-t border-ps-border">
                      <p class="text-xs text-ps-warning mb-2">
                        {selectedFile()!.data.errors.length} warning(s)
                      </p>
                      <div class="text-xs text-ps-text-muted space-y-1 max-h-32 overflow-y-auto">
                        <For each={selectedFile()!.data.errors}>
                          {(error) => <p class="truncate" title={error}>{error}</p>}
                        </For>
                      </div>
                    </div>
                  </Show>
                </div>
              </Show>
            </aside>

            {/* Main content */}
            <div class="flex-1 min-w-0">
              {/* Toolbar */}
              <div class="flex items-center gap-4 mb-4">
                <div class="flex-1">
                  <SearchBar
                    value={searchQuery()}
                    onSearch={setSearchQuery}
                    placeholder="Search by name, type, or ID..."
                  />
                </div>

                <div class="flex items-center gap-2">
                  {/* Sort */}
                  <select
                    value={sortBy()}
                    onChange={(e) => setSortBy(e.currentTarget.value as 'name' | 'type' | 'diameter')}
                    class="bg-ps-bg-dark border border-ps-border rounded px-3 py-2 text-sm text-ps-text"
                  >
                    <option value="name">Sort by Name</option>
                    <option value="type">Sort by Type</option>
                    <option value="diameter">Sort by Diameter</option>
                  </select>

                  {/* View mode */}
                  <div class="flex bg-ps-bg-dark border border-ps-border rounded overflow-hidden">
                    <button
                      onClick={() => setViewMode('grid')}
                      class={`p-2 ${viewMode() === 'grid' ? 'bg-ps-bg-light text-ps-text-bright' : 'text-ps-text-muted'}`}
                      aria-label="Grid view"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setViewMode('list')}
                      class={`p-2 ${viewMode() === 'list' ? 'bg-ps-bg-light text-ps-text-bright' : 'text-ps-text-muted'}`}
                      aria-label="List view"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              {/* Results count */}
              <div class="mb-4 text-sm text-ps-text-muted">
                Showing {filteredBrushes().length} of {selectedFile()?.data.brushes.length || 0} brushes
              </div>

              {/* Brush grid */}
              <Show
                when={viewMode() === 'grid'}
                fallback={
                  // List view
                  <div class="space-y-2">
                    <For each={filteredBrushes()}>
                      {(brush, index) => (
                        <div
                          class="flex items-center gap-4 p-3 bg-ps-bg rounded-lg border border-ps-border hover:border-ps-border-light cursor-pointer"
                          onClick={() => setSelectedBrush(brush)}
                        >
                          <div class="w-12 h-12 checkered-bg rounded overflow-hidden flex-shrink-0">
                            <Show when={brush.imageDataUrl}>
                              <img
                                src={brush.imageDataUrl}
                                alt={brush.name}
                                class="w-full h-full object-contain"
                              />
                            </Show>
                          </div>
                          <div class="flex-1 min-w-0">
                            <p class="font-medium text-ps-text-bright truncate">{brush.name}</p>
                            <p class="text-xs text-ps-text-muted">
                              {brush.type} • {brush.diameter ? `${brush.diameter}px` : 'N/A'}
                            </p>
                          </div>
                          <div class="text-xs text-ps-text-muted">
                            #{index() + 1}
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                }
              >
                {/* Grid view */}
                <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  <For each={filteredBrushes()}>
                    {(brush, index) => (
                      <BrushCard
                        brush={brush}
                        index={index()}
                        onClick={() => setSelectedBrush(brush)}
                        onDownloadImage={brush.brushTip ? () => handleDownloadImage(brush) : undefined}
                      />
                    )}
                  </For>
                </div>
              </Show>

              {/* Empty state */}
              <Show when={filteredBrushes().length === 0 && searchQuery()}>
                <div class="text-center py-12">
                  <div class="w-16 h-16 mx-auto bg-ps-bg-light rounded-full flex items-center justify-center mb-4">
                    <svg class="w-8 h-8 text-ps-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <p class="text-ps-text-muted">No brushes match "{searchQuery()}"</p>
                  <button
                    onClick={() => setSearchQuery('')}
                    class="mt-2 text-ps-accent hover:text-ps-accent-hover text-sm"
                  >
                    Clear search
                  </button>
                </div>
              </Show>

              {/* Empty state when no brushes */}
              <Show when={filteredBrushes().length === 0 && !searchQuery() && selectedFile()}>
                <div class="text-center py-12">
                  <div class="w-16 h-16 mx-auto bg-ps-bg-light rounded-full flex items-center justify-center mb-4">
                    <svg class="w-8 h-8 text-ps-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <p class="text-ps-text-muted mb-2">No brushes in this file yet</p>
                  <button
                    onClick={handleCreateBrush}
                    class="px-4 py-2 bg-ps-accent hover:bg-ps-accent-hover text-white rounded text-sm"
                  >
                    Create your first brush
                  </button>
                </div>
              </Show>
            </div>
          </div>
        </Show>

        {/* Brush detail modal - now editable */}
        <Show when={selectedBrush()}>
          <BrushDetailEditable
            brush={selectedBrush()!}
            onClose={() => setSelectedBrush(null)}
            onSave={(updatedBrush) => {
              handleSaveBrush(updatedBrush);
              setSelectedBrush(updatedBrush);
            }}
            onDelete={() => handleDeleteBrush(selectedBrush()!)}
            onDuplicate={() => handleDuplicateBrush(selectedBrush()!)}
          />
        </Show>

        {/* Brush editor modal */}
        <Show when={editingBrush() || isCreatingBrush()}>
          <BrushEditor
            brush={editingBrush() || undefined}
            isNew={isCreatingBrush()}
            onSave={handleSaveBrush}
            onCancel={() => {
              setEditingBrush(null);
              setIsCreatingBrush(false);
            }}
          />
        </Show>
      </main>

      {/* Footer */}
      <footer class="border-t border-ps-border bg-ps-bg mt-auto">
        <div class="max-w-7xl mx-auto px-4 py-4 text-center text-xs text-ps-text-muted">
          <p>ABR Editor • Create, edit, and export Photoshop brush files v6+</p>
          <p class="mt-1">All processing happens locally in your browser. No files are uploaded.</p>
        </div>
      </footer>
    </div>
  );
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_');
}
