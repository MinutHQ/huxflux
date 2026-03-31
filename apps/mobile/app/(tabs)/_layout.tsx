import { Tabs } from "expo-router"
import { Text } from "react-native"

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: "#0a0a0a" },
        headerTintColor: "#fafafa",
        tabBarStyle: { backgroundColor: "#0a0a0a", borderTopColor: "#1f1f1f" },
        tabBarActiveTintColor: "#60a5fa",
        tabBarInactiveTintColor: "#71717a",
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Agents",
          tabBarLabel: "Agents",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⬡</Text>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarLabel: "Settings",
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⚙</Text>,
        }}
      />
    </Tabs>
  )
}
