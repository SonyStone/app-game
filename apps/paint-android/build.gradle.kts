import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application") version "8.11.0"
    id("org.jetbrains.kotlin.android") version "2.1.20"
}

android {
    namespace = "dev.appgame.paint"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.appgame.paint"
        // 30 for WindowInsetsController; gesture exclusion needs 29.
        minSdk = 30
        targetSdk = 35
        versionCode = 1
        versionName = "0.1"
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_17
    }
}

dependencies {
    // WebViewCompat.addWebMessageListener: the page bridge with an origin allowlist.
    implementation("androidx.webkit:webkit:1.12.1")
}
