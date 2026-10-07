const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, '..', 'node_modules', 'expo-notifications', 'build');

function patchFile(relativePath, search, replace, label) {
  const filePath = path.join(baseDir, relativePath);
  if (!fs.existsSync(filePath)) {
    console.log(`[PATCH] ${relativePath} not found (skipping).`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(search)) {
    content = content.replace(search, replace);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`[PATCH] ${label || relativePath} patched successfully!`);
  } else {
    console.log(`[PATCH] ${label || relativePath} already patched or up to date.`);
  }
}

// 1. Evita throw fatal em warnOfExpoGoPushUsage
patchFile(
  'warnOfExpoGoPushUsage.js',
  'throw new Error(message);',
  'didWarn = true;\n            console.warn(message);',
  'warnOfExpoGoPushUsage.js'
);

// 2. TopicSubscriptionModule.android.js (ExpoTopicSubscriptionModule removido no Expo Go)
patchFile(
  'TopicSubscriptionModule.android.js',
  "import { requireNativeModule } from 'expo-modules-core';\nexport default requireNativeModule('ExpoTopicSubscriptionModule');",
  "import { requireOptionalNativeModule } from 'expo-modules-core';\nexport default requireOptionalNativeModule('ExpoTopicSubscriptionModule') || {};",
  'TopicSubscriptionModule.android.js'
);

// 3. PushTokenManager.native.js (ExpoPushTokenManager removido no Expo Go)
patchFile(
  'PushTokenManager.native.js',
  "import { requireNativeModule } from 'expo-modules-core';\nexport default requireNativeModule('ExpoPushTokenManager');",
  "import { requireOptionalNativeModule } from 'expo-modules-core';\nconst mod = requireOptionalNativeModule('ExpoPushTokenManager');\nexport default mod || { addListener: () => ({ remove: () => {} }), removeListeners: () => {} };",
  'PushTokenManager.native.js'
);

// 4. ServerRegistrationModule.native.js (NotificationsServerRegistrationModule removido no Expo Go)
patchFile(
  'ServerRegistrationModule.native.js',
  "import { requireNativeModule } from 'expo-modules-core';\nexport default requireNativeModule('NotificationsServerRegistrationModule');",
  "import { requireOptionalNativeModule } from 'expo-modules-core';\nexport default requireOptionalNativeModule('NotificationsServerRegistrationModule') || {};",
  'ServerRegistrationModule.native.js'
);

// 5. BackgroundNotificationTasksModule.native.js (removido no Expo Go)
patchFile(
  'BackgroundNotificationTasksModule.native.js',
  "import { requireNativeModule } from 'expo-modules-core';\nexport default requireNativeModule('ExpoBackgroundNotificationTasksModule');",
  "import { requireOptionalNativeModule } from 'expo-modules-core';\nexport default requireOptionalNativeModule('ExpoBackgroundNotificationTasksModule') || {};",
  'BackgroundNotificationTasksModule.native.js'
);

// 6. BadgeModule.native.js (ExpoBadgeModule seguro)
patchFile(
  'BadgeModule.native.js',
  "import { requireNativeModule } from 'expo-modules-core';\nconst nativeModule = requireNativeModule('ExpoBadgeModule');",
  "import { requireNativeModule, requireOptionalNativeModule } from 'expo-modules-core';\nconst nativeModule = (typeof requireOptionalNativeModule !== 'undefined' ? requireOptionalNativeModule('ExpoBadgeModule') : null) || {};",
  'BadgeModule.native.js'
);

// 7. NotificationCategoriesModule.native.js (seguro)
patchFile(
  'NotificationCategoriesModule.native.js',
  "import { requireNativeModule } from 'expo-modules-core';\nexport default requireNativeModule('ExpoNotificationCategoriesModule');",
  "import { requireOptionalNativeModule } from 'expo-modules-core';\nexport default requireOptionalNativeModule('ExpoNotificationCategoriesModule') || {};",
  'NotificationCategoriesModule.native.js'
);

console.log('[PATCH] Todos os módulos nativos do expo-notifications verificados com sucesso!');
