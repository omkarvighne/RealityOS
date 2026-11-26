import AsyncStorage from '@react-native-async-storage/async-storage';

export const initDB = async () => {
  try {
    const existingTasks = await AsyncStorage.getItem('tasks');
    if (existingTasks === null) {
      // If no memory exists, create a blank slate
      await AsyncStorage.setItem('tasks', JSON.stringify([]));
      console.log("Memory initialized: Blank slate.");
    } else {
      console.log("Memory online: Previous data loaded.");
    }
  } catch (error) {
    console.error("Memory failed to boot:", error);
  }
};