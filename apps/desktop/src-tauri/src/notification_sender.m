#import <AppKit/AppKit.h>

@interface NotificationDelegate : NSObject <NSUserNotificationCenterDelegate>
@property BOOL delivered;
@end
@implementation NotificationDelegate
- (BOOL)userNotificationCenter:(NSUserNotificationCenter *)center shouldPresentNotification:(NSUserNotification *)notification { return YES; }
- (void)userNotificationCenter:(NSUserNotificationCenter *)center didDeliverNotification:(NSUserNotification *)notification { self.delivered = YES; }
@end

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 3) return 2;
        [NSApplication sharedApplication];
        NotificationDelegate *delegate = [NotificationDelegate new];
        NSUserNotificationCenter *center = [NSUserNotificationCenter defaultUserNotificationCenter];
        center.delegate = delegate;
        NSUserNotification *notification = [NSUserNotification new];
        notification.title = [NSString stringWithUTF8String:argv[1]];
        notification.informativeText = [NSString stringWithUTF8String:argv[2]];
        [center deliverNotification:notification];
        NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:5];
        while (!delegate.delivered && [deadline timeIntervalSinceNow] > 0) {
            [[NSRunLoop currentRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.05]];
        }
        return delegate.delivered ? 0 : 1;
    }
}
