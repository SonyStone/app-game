import { Systems } from './systems';

/**
 * @classdesc
 * A base Phaser.Scene class which can be extended for your own use.
 *
 * You can also define the optional methods {@link Phaser.Types.Scenes.SceneInitCallback init()}, {@link Phaser.Types.Scenes.ScenePreloadCallback preload()}, and {@link Phaser.Types.Scenes.SceneCreateCallback create()}.
 *
 * @class Scene
 * @memberof Phaser
 * @constructor
 * @since 3.0.0
 *
 * @param {(string|Phaser.Types.Scenes.SettingsConfig)} [config] - The scene key or scene specific configuration settings.
 */
export abstract class Scene {
  /**
   * The Scene Systems. You must never overwrite this property, or all hell will break lose.
   *
   * @name Phaser.Scene#sys
   * @type {Phaser.Scenes.Systems}
   * @since 3.0.0
   */
  sys = new Systems(this, this.config);

  /**
   * A reference to the Phaser.Game instance.
   *
   * This property will only be available if defined in the Scene Injection Map.
   *
   * @name Phaser.Scene#game
   * @since 3.0.0
   */
  game!: Phaser.Game;

  /**
   * A reference to the global Animation Manager.
   *
   * This property will only be available if defined in the Scene Injection Map.
   *
   * @name Phaser.Scene#anims
   * @since 3.0.0
   */
  anims!: Phaser.Animations.AnimationManager;

  /**
   * A reference to the global Cache.
   *
   * This property will only be available if defined in the Scene Injection Map.
   *
   * @name Phaser.Scene#cache
   * @since 3.0.0
   */
  cache!: Phaser.Cache.CacheManager;

  /**
   * A reference to the global Data Manager.
   *
   * This property will only be available if defined in the Scene Injection Map.
   *
   * @name Phaser.Scene#registry
   * @since 3.0.0
   */
  registry!: Phaser.Data.DataManager;

  /**
   * A reference to the Sound Manager.
   *
   * This property will only be available if defined in the Scene Injection Map and the plugin is installed.
   *
   * @name Phaser.Scene#sound
   * @since 3.0.0
   */
  sound!:
    | Phaser.Sound.NoAudioSoundManager
    | Phaser.Sound.HTML5AudioSoundManager
    | Phaser.Sound.WebAudioSoundManager;

  /**
   * A reference to the Texture Manager.
   *
   * This property will only be available if defined in the Scene Injection Map.
   *
   * @name Phaser.Scene#textures
   * @since 3.0.0
   */
  textures!: Phaser.Textures.TextureManager;

  /**
   * A Scene specific Event Emitter.
   *
   * This property will only be available if defined in the Scene Injection Map.
   *
   * @name Phaser.Scene#events
   * @since 3.0.0
   */
  events!: Phaser.Events.EventEmitter;

  /**
   * The Scene Camera Manager.
   *
   * This property will only be available if defined in the Scene Injection Map.
   *
   * @name Phaser.Scene#cameras
   * @since 3.0.0
   */
  cameras!: Phaser.Cameras.Scene2D.CameraManager;

  /**
   * The Scene Game Object Factory.
   *
   * This property will only be available if defined in the Scene Injection Map.
   *
   * @name Phaser.Scene#add
   * @since 3.0.0
   */
  add!: Phaser.GameObjects.GameObjectFactory;

  /**
   * The Scene Game Object Creator.
   *
   * This property will only be available if defined in the Scene Injection Map.
   *
   * @name Phaser.Scene#make
   * @since 3.0.0
   */
  make!: Phaser.GameObjects.GameObjectCreator;

  /**
   * A reference to the Scene Manager Plugin.
   *
   * This property will only be available if defined in the Scene Injection Map.
   *
   * @name Phaser.Scene#scene
   * @since 3.0.0
   */
  scene!: Phaser.Scenes.ScenePlugin;

  /**
   * The Game Object Display List belonging to this Scene.
   *
   * This property will only be available if defined in the Scene Injection Map.
   *
   * @name Phaser.Scene#children
   * @since 3.0.0
   */
  children!: Phaser.GameObjects.DisplayList;

  /**
   * The Scene Lights Manager Plugin.
   *
   * This property will only be available if defined in the Scene Injection Map and the plugin is installed.
   *
   * @name Phaser.Scene#lights
   * @since 3.0.0
   */
  lights!: Phaser.GameObjects.LightsManager;

  /**
   * A Scene specific Data Manager Plugin.
   *
   * See the `registry` property for the global Data Manager.
   *
   * This property will only be available if defined in the Scene Injection Map and the plugin is installed.
   *
   * @name Phaser.Scene#data
   * @type {Phaser.Data.DataManager}
   * @since 3.0.0
   */
  data!: Phaser.Data.DataManager;

  /**
   * The Scene Input Manager Plugin.
   *
   * This property will only be available if defined in the Scene Injection Map and the plugin is installed.
   *
   * @name Phaser.Scene#input
   * @type {Phaser.Input.InputPlugin}
   * @since 3.0.0
   */
  input!: Phaser.Input.InputPlugin;

  /**
   * The Scene Loader Plugin.
   *
   * This property will only be available if defined in the Scene Injection Map and the plugin is installed.
   *
   * @name Phaser.Scene#load
   * @type {Phaser.Loader.LoaderPlugin}
   * @since 3.0.0
   */
  load!: Phaser.Loader.LoaderPlugin;

  /**
   * The Scene Time and Clock Plugin.
   *
   * This property will only be available if defined in the Scene Injection Map and the plugin is installed.
   *
   * @name Phaser.Scene#time
   * @type {Phaser.Time.Clock}
   * @since 3.0.0
   */
  time!: Phaser.Time.Clock;

  /**
   * The Scene Tween Manager Plugin.
   *
   * This property will only be available if defined in the Scene Injection Map and the plugin is installed.
   *
   * @name Phaser.Scene#tweens
   * @type {Phaser.Tweens.TweenManager}
   * @since 3.0.0
   */
  tweens!: Phaser.Tweens.TweenManager;

  /**
   * The Scene Arcade Physics Plugin.
   *
   * This property will only be available if defined in the Scene Injection Map, the plugin is installed and configured.
   *
   * @name Phaser.Scene#physics
   * @type {Phaser.Physics.Arcade.ArcadePhysics}
   * @since 3.0.0
   */
  physics!: Phaser.Physics.Arcade.ArcadePhysics;

  /**
   * The Scene Matter Physics Plugin.
   *
   * This property will only be available if defined in the Scene Injection Map, the plugin is installed and configured.
   *
   * @name Phaser.Scene#matter
   * @type {Phaser.Physics.Matter.MatterPhysics}
   * @since 3.0.0
   */
  matter!: Phaser.Physics.Matter.MatterPhysics;

  constructor(
    private readonly config: string | Phaser.Types.Scenes.SettingsConfig
  ) {}

  /**
   * The Facebook Instant Games Plugin.
   *
   * This property will only be available if defined in the Scene Injection Map, the plugin is installed and configured.
   *
   * @name Phaser.Scene#facebook
   * @type {Phaser.FacebookInstantGamesPlugin}
   * @since 3.12.0
   */
  facebook?: Phaser.FacebookInstantGamesPlugin;

  /**
   * A reference to the global Scale Manager.
   *
   * This property will only be available if defined in the Scene Injection Map.
   *
   * @name Phaser.Scene#scale
   * @type {Phaser.Scale.ScaleManager}
   * @since 3.16.2
   */
  scale!: Phaser.Scale.ScaleManager;

  /**
   * A reference to the global Plugin Manager.
   *
   * The Plugin Manager is a global system that allows plugins to register themselves with it, and can then install
   * those plugins into Scenes as required.
   *
   * @name Phaser.Scene#plugins
   * @since 3.0.0
   */
  plugins!: Phaser.Plugins.PluginManager;

  /**
   * A reference to the renderer instance Phaser is using, either Canvas Renderer or WebGL Renderer.
   *
   * @name Phaser.Scene#renderer
   * @since 3.50.0
   */
  renderer!:
    | Phaser.Renderer.Canvas.CanvasRenderer
    | Phaser.Renderer.WebGL.WebGLRenderer;

  /**
   * This method should be overridden by your own Scenes.
   *
   * This method is called once per game step while the scene is running.
   *
   * @method Phaser.Scene#update
   * @since 3.0.0
   *
   * @param {number} time - The current time. Either a High Resolution Timer value if it comes from Request Animation Frame, or Date.now if using SetTimeout.
   * @param {number} delta - The delta time in ms since the last frame. This is a smoothed and capped value based on the FPS rate.
   */
  update(this: Scene, time: number, delta: number) {}
}
