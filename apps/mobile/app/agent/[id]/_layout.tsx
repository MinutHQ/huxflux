import { Stack, useLocalSearchParams, useRouter } from "expo-router"
import { useAgent } from "@hive/shared"
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native"
import { c } from "../../../theme"

export default function AgentLayout() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { data: agent, isLoading } = useAgent(id ?? null)

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={c.link} />
      </View>
    )
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.fg,
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: agent?.title ?? "Agent",
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={{ marginRight: 8 }}>
              <Text style={{ color: c.link, fontSize: 16 }}>‹ Agents</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <Stack.Screen name="files" options={{ title: "Files" }} />
      <Stack.Screen name="pr" options={{ title: "Pull Request" }} />
      <Stack.Screen name="diff" options={{ title: "Diff" }} />
    </Stack>
  )
}
