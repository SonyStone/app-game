export const FILE_CONST = {
  /**
   * The Loader is idle.
   */
  LOADER_IDLE: 0,

  /**
   * The Loader is actively loading.
   */
  LOADER_LOADING: 1,

  /**
   * The Loader is processing files is has loaded.
   */
  LOADER_PROCESSING: 2,

  /**
   * The Loader has completed loading and processing.
   */
  LOADER_COMPLETE: 3,

  /**
   * The Loader is shutting down.
   */
  LOADER_SHUTDOWN: 4,

  /**
   * The Loader has been destroyed.
   */
  LOADER_DESTROYED: 5,

  /**
   * File is in the load queue but not yet started.
   */
  FILE_PENDING: 10,

  /**
   * File has been started to load by the loader (onLoad called)
   */
  FILE_LOADING: 11,

  /**
   * File has loaded successfully, awaiting processing.
   */
  FILE_LOADED: 12,

  /**
   * File failed to load.
   */
  FILE_FAILED: 13,

  /**
   * File is being processed (onProcess callback)
   */
  FILE_PROCESSING: 14,

  /**
   * The File has errored somehow during processing.
   */
  FILE_ERRORED: 16,

  /**
   * File has finished processing.
   */
  FILE_COMPLETE: 17,

  /**
   * File has been destroyed.
   */
  FILE_DESTROYED: 18,

  /**
   * File was populated from local data and doesn't need an HTTP request.
   */
  FILE_POPULATED: 19,

  /**
   * File is pending being destroyed.
   */
  FILE_PENDING_DESTROY: 20,
};
