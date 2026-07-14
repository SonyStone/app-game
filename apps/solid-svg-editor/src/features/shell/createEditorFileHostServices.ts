import type { ReferenceImageService, SvgImportService } from '../../editor/kernel';
import { createSvgImport } from '../import/createSvgImport';
import { createReferenceImage } from '../reference/createReferenceImage';

export interface CreateEditorFileHostServicesOptions {
  readonly importSvgText: (text: string, name: string) => void;
}

export interface EditorFileHostServices {
  readonly svgImport: SvgImportService;
  readonly referenceImage: ReferenceImageService;
}

export function createEditorFileHostServices(
  options: CreateEditorFileHostServicesOptions
): EditorFileHostServices {
  const svgImport = createSvgImport({ importSvgText: options.importSvgText });
  const referenceImage = createReferenceImage();

  return {
    svgImport: {
      dropActive: svgImport.isSvgDropActive,
      setInputRef: svgImport.setImportInputRef,
      openDialog: svgImport.openImportDialog,
      onFile: svgImport.onImportFile,
      onDragEnter: svgImport.onDragEnter,
      onDragOver: svgImport.onDragOver,
      onDragLeave: svgImport.onDragLeave,
      onDrop: svgImport.onDrop
    },
    referenceImage: {
      image: referenceImage.referenceImage,
      show: referenceImage.showReference,
      setShow: referenceImage.setShowReference,
      overlay: referenceImage.overlayReference,
      setOverlay: referenceImage.setOverlayReference,
      setInputRef: referenceImage.setReferenceInputRef,
      openDialog: referenceImage.openReferenceDialog,
      onFile: referenceImage.onReferenceFile,
      clear: referenceImage.clearReference
    }
  } satisfies EditorFileHostServices;
}
