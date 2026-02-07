---
layout: default
title: Translation
parent: Advanced mods
nav_order: 4
---

# Translations

The mod API also allows for providing custom translations for the game. This can override existing languages (merging the translations from the mod with the base game translations) or add new ones.

## Extracting Translations

To extract all the game text, open the game in dev mode. Then, from the debug menu select the 'Translations' menu. In this dialog, you can export the translation file of any language currently registered, or just a completely fresh file if desired.

## Providing Translations

To provide translations, use the mod API function `addTranslation`. This takes the language code (`es`, `en`, `ru`, etc), and the translation file (the one you exported earlier). If a player installs a mod that provides translations, the game will default to that language.

## Utilities

To make it easier to manage the task of translation, a helper application has been built. You can find it here: [Community Translation App](https://drive.google.com/file/d/1j-IekRMLPPUYECiAHAMpZDnw1irqbxu0/view?usp=drive_link).

This lets you open a translations file exported from the debug menu and quickly browse and edit it.