import { Stack, useLocalSearchParams } from "expo-router"
import { useAgent } from "@hive/shared"
import { View, Text, ActivityIndicator } from "react-native"

export default function AgentLayout() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: agent, isLoading } = useAgent(id ?? null)

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#0a0a0a", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color="#60a5fa" />
      </View>
    )
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#0a0a0a" },
        headerTintColor: "#fafafa",
        contentStyle: { backgroundColor: "#0a0a0a" },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: agent?.title ?? "Agent",
          headerBackTitle: "Back",
        }}
      />
      <Stack.Screen name="files" options={{ title: "Files" }} />
      <Stack.Screen name="pr" options={{ title: "Pull Request" }} />
    </Stack>
  )
}
