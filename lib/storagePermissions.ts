import { Platform, PermissionsAndroid } from 'react-native';

/**
 * Requests storage-related permissions on Android.
 * - Android 13+ uses READ_MEDIA_* scoped permissions.
 * - Android < 13 uses READ/WRITE_EXTERNAL_STORAGE.
 * The app-internal documentDirectory does NOT require these, but
 * requesting them satisfies user requirement for "storage permissions".
 */
export async function requestStoragePermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
        const sdkVersion = typeof Platform.Version === 'number' ? Platform.Version : parseInt(Platform.Version, 10);

        if (sdkVersion >= 33) {
            // Android 13+ uses scoped READ_MEDIA_* permissions
            const result = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
                PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
            ]);
            // These are media-scoped; document storage still works without them.
            return Object.values(result).every(
                r => r === PermissionsAndroid.RESULTS.GRANTED || r === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
            );
        } else {
            // Android < 13: request legacy storage permissions
            const read = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
                { title: 'Storage Access', message: 'RVX Notes needs storage access to save your notes and summaries securely.', buttonPositive: 'Allow', buttonNegative: 'Deny' }
            );
            const write = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
                { title: 'Storage Access', message: 'RVX Notes needs storage access to save your notes and summaries securely.', buttonPositive: 'Allow', buttonNegative: 'Deny' }
            );
            return (
                read === PermissionsAndroid.RESULTS.GRANTED &&
                write === PermissionsAndroid.RESULTS.GRANTED
            );
        }
    } catch (err) {
        console.warn('Permission request failed:', err);
        return false;
    }
}
