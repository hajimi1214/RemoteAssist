buildscript {
    repositories {
        google()
        System.getenv("REMOTEASSIST_MAVEN_MIRROR")?.takeIf { it.isNotBlank() }?.let { maven { url = uri(it) } }
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:9.3.1")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.10")
    }
}

allprojects {
    repositories {
        google()
        System.getenv("REMOTEASSIST_MAVEN_MIRROR")?.takeIf { it.isNotBlank() }?.let { maven { url = uri(it) } }
        mavenCentral()
    }
}

tasks.register("clean").configure {
    delete("build")
}
