import { FILE_CONST } from './const';
import { LoaderPlugin } from './loader-plugin';

/**
 * Static method for creating object URL using URL API and setting it as image 'src' attribute.
 * If URL API is not supported (usually on old browsers) it falls back to creating Base64 encoded url using FileReader.
 *
 * @param image - Image object which 'src' attribute should be set to object URL.
 * @param blob - A Blob object to create an object URL for.
 * @param defaultType - Default mime type used if blob type is not available.
 */
export function createObjectURL(
  image: HTMLImageElement,
  blob: Blob,
  defaultType: string
) {
  if (typeof URL === 'function') {
    image.src = URL.createObjectURL(blob);
  } else {
    const reader = new FileReader();

    reader.onload = function () {
      image.removeAttribute('crossOrigin');
      image.src =
        'data:' +
        (blob.type || defaultType) +
        ';base64,' +
        (reader.result as string).split(',')[1];
    };

    reader.onerror = image.onerror;

    reader.readAsDataURL(blob);
  }
}

/**
 * Static method for releasing an existing object URL which was previously created
 * by calling {@link File#createObjectURL} method.
 *
 * @param image - Image object which 'src' attribute should be revoked.
 */
export function revokeObjectURL(image: HTMLImageElement) {
  if (typeof URL === 'function') {
    URL.revokeObjectURL(image.src);
  }
}

/**
 * @classdesc
 * The base File class used by all File Types that the Loader can support.
 * You shouldn't create an instance of a File directly, but should extend it with your own class, setting a custom type and processing methods.
 *
 * @class File
 * @memberof Phaser.Loader
 * @constructor
 * @since 3.0.0
 *
 * @param {Phaser.Loader.LoaderPlugin} loader - The Loader that is going to load this File.
 * @param {Phaser.Types.Loader.FileConfig} fileConfig - The file configuration object, as created by the file type.
 */
export class File {
  /**
   * A reference to the Loader that is going to load this file.
   */
  loader: LoaderPlugin;

  /**
   * A reference to the Cache, or Texture Manager, that is going to store this file if it loads.
   */
  cache: Phaser.Cache.BaseCache | Phaser.Textures.TextureManager;

  /**
   * The file type string (image, json, etc) for sorting within the Loader.
   *
   * @name Phaser.Loader.File#type
   * @type {string}
   * @since 3.0.0
   */
  type: string;

  /**
   * Unique cache key (unique within its file type)
   */
  key: string;

  /**
   * The URL of the file, not including baseURL.
   *
   * Automatically has Loader.path prepended to it if a string.
   *
   * Can also be a JavaScript Object, such as the results of parsing JSON data.
   */
  url: object | string;

  /**
   * The final URL this file will load from, including baseURL and path.
   * Set automatically when the Loader calls 'load' on this file.
   */
  src = '';

  /**
   * The merged XHRSettings for this file.
   */
  xhrSettings: Phaser.Types.Loader.XHRSettingsObject;

  /**
   * The XMLHttpRequest instance (as created by XHR Loader) that is loading this File.
   */
  xhrLoader?: XMLHttpRequest;

  /**
   * The current state of the file. One of the FILE_CONST values.
   */
  state: number;

  constructor(
    loader: LoaderPlugin,
    fileConfig: Phaser.Types.Loader.FileConfig
  ) {
    this.loader = loader;
    this.cache = fileConfig.cache ?? false;
    this.type = fileConfig.type ?? false;

    if (!this.type) {
      throw new Error('Invalid File type: ' + this.type);
    }

    this.key = fileConfig.key ?? false;

    const loadKey = this.key;

    if (loader.prefix && loader.prefix !== '') {
      this.key = loader.prefix + loadKey;
    }

    if (!this.key) {
      throw new Error('Invalid File key: ' + this.key);
    }

    let url = fileConfig.url;

    if (url === undefined) {
      url = loader.path + loadKey + '.' + fileConfig.extension ?? '';
    } else if (
      typeof url === 'string' &&
      !url.match(/^(?:blob:|data:|capacitor:\/\/|http:\/\/|https:\/\/|\/\/)/)
    ) {
      url = loader.path + url;
    }

    this.url = url;

    this.xhrSettings = XHRSettings(
      GetFastValue(fileConfig, 'responseType', undefined)
    );

    if (GetFastValue(fileConfig, 'xhrSettings', false)) {
      this.xhrSettings = MergeXHRSettings(
        this.xhrSettings,
        GetFastValue(fileConfig, 'xhrSettings', {})
      );
    }

    this.state =
      typeof this.url === 'function'
        ? FILE_CONST.FILE_POPULATED
        : FILE_CONST.FILE_PENDING;

    /**
     * The total size of this file.
     * Set by onProgress and only if loading via XHR.
     *
     * @name Phaser.Loader.File#bytesTotal
     * @type {number}
     * @default 0
     * @since 3.0.0
     */
    this.bytesTotal = 0;

    /**
     * Updated as the file loads.
     * Only set if loading via XHR.
     *
     * @name Phaser.Loader.File#bytesLoaded
     * @type {number}
     * @default -1
     * @since 3.0.0
     */
    this.bytesLoaded = -1;

    /**
     * A percentage value between 0 and 1 indicating how much of this file has loaded.
     * Only set if loading via XHR.
     *
     * @name Phaser.Loader.File#percentComplete
     * @type {number}
     * @default -1
     * @since 3.0.0
     */
    this.percentComplete = -1;

    /**
     * For CORs based loading.
     * If this is undefined then the File will check BaseLoader.crossOrigin and use that (if set)
     *
     * @name Phaser.Loader.File#crossOrigin
     * @type {(string|undefined)}
     * @since 3.0.0
     */
    this.crossOrigin = undefined;

    /**
     * The processed file data, stored here after the file has loaded.
     *
     * @name Phaser.Loader.File#data
     * @type {*}
     * @since 3.0.0
     */
    this.data = undefined;

    /**
     * A config object that can be used by file types to store transitional data.
     *
     * @name Phaser.Loader.File#config
     * @type {*}
     * @since 3.0.0
     */
    this.config = GetFastValue(fileConfig, 'config', {});

    /**
     * If this is a multipart file, i.e. an atlas and its json together, then this is a reference
     * to the parent MultiFile. Set and used internally by the Loader or specific file types.
     *
     * @name Phaser.Loader.File#multiFile
     * @type {?Phaser.Loader.MultiFile}
     * @since 3.7.0
     */
    this.multiFile;

    /**
     * Does this file have an associated linked file? Such as an image and a normal map.
     * Atlases and Bitmap Fonts use the multiFile, because those files need loading together but aren't
     * actually bound by data, where-as a linkFile is.
     *
     * @name Phaser.Loader.File#linkFile
     * @type {?Phaser.Loader.File}
     * @since 3.7.0
     */
    this.linkFile;
  }

  /**
   * Links this File with another, so they depend upon each other for loading and processing.
   *
   * @method Phaser.Loader.File#setLink
   * @since 3.7.0
   *
   * @param {Phaser.Loader.File} fileB - The file to link to this one.
   */
  setLink(fileB) {
    this.linkFile = fileB;

    fileB.linkFile = this;
  }

  /**
   * Resets the XHRLoader instance this file is using.
   *
   * @method Phaser.Loader.File#resetXHR
   * @since 3.0.0
   */
  resetXHR() {
    if (this.xhrLoader) {
      this.xhrLoader.onload = undefined;
      this.xhrLoader.onerror = undefined;
      this.xhrLoader.onprogress = undefined;
    }
  }

  /**
   * Called by the Loader, starts the actual file downloading.
   * During the load the methods onLoad, onError and onProgress are called, based on the XHR events.
   * You shouldn't normally call this method directly, it's meant to be invoked by the Loader.
   *
   * @method Phaser.Loader.File#load
   * @since 3.0.0
   */
  load() {
    if (this.state === FILE_CONST.FILE_POPULATED) {
      //  Can happen for example in a JSONFile if they've provided a JSON object instead of a URL
      this.loader.nextFile(this, true);
    } else {
      this.state = FILE_CONST.FILE_LOADING;

      this.src = GetURL(this, this.loader.baseURL);

      if (this.src.indexOf('data:') === 0) {
        console.warn('Local data URIs are not supported: ' + this.key);
      } else {
        //  The creation of this XHRLoader starts the load process going.
        //  It will automatically call the following, based on the load outcome:
        //
        // xhr.onload = this.onLoad
        // xhr.onerror = this.onError
        // xhr.onprogress = this.onProgress

        this.xhrLoader = XHRLoader(this, this.loader.xhr);
      }
    }
  }

  /**
   * Called when the file finishes loading, is sent a DOM ProgressEvent.
   *
   * @method Phaser.Loader.File#onLoad
   * @since 3.0.0
   *
   * @param {XMLHttpRequest} xhr - The XMLHttpRequest that caused this onload event.
   * @param {ProgressEvent} event - The DOM ProgressEvent that resulted from this load.
   */
  onLoad(xhr, event) {
    const isLocalFile =
      xhr.responseURL &&
      this.loader.localSchemes.some(function (scheme) {
        return xhr.responseURL.indexOf(scheme) === 0;
      });

    const localFileOk = isLocalFile && event.target.status === 0;

    const success =
      !(event.target && event.target.status !== 200) || localFileOk;

    //  Handle HTTP status codes of 4xx and 5xx as errors, even if xhr.onerror was not called.
    if (xhr.readyState === 4 && xhr.status >= 400 && xhr.status <= 599) {
      success = false;
    }

    this.state = CONST.FILE_LOADED;

    this.resetXHR();

    this.loader.nextFile(this, success);
  }

  /**
   * Called if the file errors while loading, is sent a DOM ProgressEvent.
   *
   * @method Phaser.Loader.File#onError
   * @since 3.0.0
   *
   * @param {XMLHttpRequest} xhr - The XMLHttpRequest that caused this onload event.
   * @param {ProgressEvent} event - The DOM ProgressEvent that resulted from this error.
   */
  onError() {
    this.resetXHR();

    this.loader.nextFile(this, false);
  }

  /**
   * Called during the file load progress. Is sent a DOM ProgressEvent.
   *
   * @method Phaser.Loader.File#onProgress
   * @fires Phaser.Loader.Events#FILE_PROGRESS
   * @since 3.0.0
   *
   * @param {ProgressEvent} event - The DOM ProgressEvent.
   */
  onProgress(event) {
    if (event.lengthComputable) {
      this.bytesLoaded = event.loaded;
      this.bytesTotal = event.total;

      this.percentComplete = Math.min(this.bytesLoaded / this.bytesTotal, 1);

      this.loader.emit(Events.FILE_PROGRESS, this, this.percentComplete);
    }
  }

  /**
   * Usually overridden by the FileTypes and is called by Loader.nextFile.
   * This method controls what extra work this File does with its loaded data, for example a JSON file will parse itself during this stage.
   *
   * @method Phaser.Loader.File#onProcess
   * @since 3.0.0
   */
  onProcess() {
    this.state = CONST.FILE_PROCESSING;

    this.onProcessComplete();
  }

  /**
   * Called when the File has completed processing.
   * Checks on the state of its multifile, if set.
   *
   * @method Phaser.Loader.File#onProcessComplete
   * @since 3.7.0
   */
  onProcessComplete() {
    this.state = CONST.FILE_COMPLETE;

    if (this.multiFile) {
      this.multiFile.onFileComplete(this);
    }

    this.loader.fileProcessComplete(this);
  }

  /**
   * Called when the File has completed processing but it generated an error.
   * Checks on the state of its multifile, if set.
   *
   * @method Phaser.Loader.File#onProcessError
   * @since 3.7.0
   */
  onProcessError() {
    // eslint-disable-next-line no-console
    console.error('Failed to process file: %s "%s"', this.type, this.key);

    this.state = CONST.FILE_ERRORED;

    if (this.multiFile) {
      this.multiFile.onFileFailed(this);
    }

    this.loader.fileProcessComplete(this);
  }

  /**
   * Checks if a key matching the one used by this file exists in the target Cache or not.
   * This is called automatically by the LoaderPlugin to decide if the file can be safely
   * loaded or will conflict.
   *
   * @method Phaser.Loader.File#hasCacheConflict
   * @since 3.7.0
   *
   * @return {boolean} `true` if adding this file will cause a conflict, otherwise `false`.
   */
  hasCacheConflict() {
    return this.cache && this.cache.exists(this.key);
  }

  /**
   * Adds this file to its target cache upon successful loading and processing.
   * This method is often overridden by specific file types.
   *
   * @method Phaser.Loader.File#addToCache
   * @since 3.7.0
   */
  addToCache() {
    if (this.cache && this.data) {
      this.cache.add(this.key, this.data);
    }
  }

  /**
   * Called once the file has been added to its cache and is now ready for deletion from the Loader.
   * It will emit a `filecomplete` event from the LoaderPlugin.
   *
   * @method Phaser.Loader.File#pendingDestroy
   * @fires Phaser.Loader.Events#FILE_COMPLETE
   * @fires Phaser.Loader.Events#FILE_KEY_COMPLETE
   * @since 3.7.0
   */
  pendingDestroy(data) {
    if (this.state === CONST.FILE_PENDING_DESTROY) {
      return;
    }

    if (data === undefined) {
      data = this.data;
    }

    const key = this.key;
    const type = this.type;

    this.loader.emit(Events.FILE_COMPLETE, key, type, data);
    this.loader.emit(
      Events.FILE_KEY_COMPLETE + type + '-' + key,
      key,
      type,
      data
    );

    this.loader.flagForRemoval(this);

    this.state = CONST.FILE_PENDING_DESTROY;
  }

  /**
   * Destroy this File and any references it holds.
   *
   * @method Phaser.Loader.File#destroy
   * @since 3.7.0
   */
  destroy() {
    this.loader = null;
    this.cache = null;
    this.xhrSettings = null;
    this.multiFile = null;
    this.linkFile = null;
    this.data = null;
  }
}