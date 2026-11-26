import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform, Alert, Modal, ScrollView } from 'react-native';
import { useEffect, useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import * as Notifications from 'expo-notifications';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';
import { initDB } from './database/db';

import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';

import { getAuth, initializeAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
// @ts-ignore
import { getReactNativePersistence } from 'firebase/auth';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ⚠️ PASTE YOUR SECURE GOOGLE GEMINI API KEY HERE ⚠️
const GEMINI_API_KEY = "PASTE_YOUR_API_KEY_HERE";

// ⚠️ PASTE YOUR FIREBASE CONFIG HERE ⚠️
const firebaseConfig = {
  apiKey: "PASTE_KEY",
  authDomain: "PASTE_DOMAIN",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_BUCKET",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};

let db: any = null;
let auth: any = null;
try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);

  // ⚠️ FAIL-SAFE SILENT AUTH INIT ⚠️
  try {
    auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch (innerError) {
    auth = getAuth(app);
  }
} catch (error) {
  console.log("Firebase Init Failed.");
}

const STRIKE_LIMIT = 5;
const PENALTY_PHRASE = "I ACCEPT ACCOUNTABILITY";

type TaskSubItem = { id: string; title: string; completed: boolean };
type Task = { id: string; title: string; completed: boolean; hours: number; dueDate: string; subTasks?: TaskSubItem[] };
type SideQuest = { id: string; title: string; completed: boolean; subTasks?: TaskSubItem[] };
type JournalEntry = { id: string; date: string; text: string };
type BrainDump = { id: string; date: string; text: string };
type ChatMessage = { sender: 'SYSTEM' | 'OMKAR'; text: string };
type SubHabit = { id: string; title: string; completed: boolean };
type HabitSection = { id: string; title: string; subHabits: SubHabit[] };
type DailyStat = { day: string; hours: number };

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [taskInput, setTaskInput] = useState('');
  const [hoursInput, setHoursInput] = useState('');
  const [dateInput, setDateInput] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [draftSubTasks, setDraftSubTasks] = useState<string[]>([]);
  const [draftSubInput, setDraftSubInput] = useState('');

  const [directiveTab, setDirectiveTab] = useState<'MAIN' | 'SIDE'>('MAIN');
  const [sideQuestInput, setSideQuestInput] = useState('');
  const [sideQuests, setSideQuests] = useState<SideQuest[]>([]);

  const [journalInput, setJournalInput] = useState('');
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);

  const [brainInput, setBrainInput] = useState('');
  const [brainDumps, setBrainDumps] = useState<BrainDump[]>([]);

  const [sectionInput, setSectionInput] = useState('');
  const [habitSections, setHabitSections] = useState<HabitSection[]>([]);
  const [subHabitInputs, setSubHabitInputs] = useState<{ [key: string]: string }>({});

  const [isInterrogating, setIsInterrogating] = useState(false);
  const [isAsleep, setIsAsleep] = useState(false);
  const [activeModule, setActiveModule] = useState('DIRECTIVES');

  const [strikes, setStrikes] = useState(0);
  const [careerWins, setCareerWins] = useState(0);
  const [deploymentHistory, setDeploymentHistory] = useState<DailyStat[]>([]);

  const [isBlacklisted, setIsBlacklisted] = useState(false);
  const [penaltyInput, setPenaltyInput] = useState('');

  const [chatInput, setChatInput] = useState('');
  const [chatLog, setChatLog] = useState<ChatMessage[]>([
    { sender: 'SYSTEM', text: 'V1.9 ONLINE. GHOST PROTOCOL ACTIVE. Awaiting command.' }
  ]);

  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const chatInputRef = useRef<TextInput>(null);

  useEffect(() => {
    const bootSystem = async () => {
      // ⚠️ THE SILENT AUTHENTICATOR ⚠️
      if (auth) {
        try {
          await signInWithEmailAndPassword(auth, "omkar@reality.os", "OmegaOverride123!");
        } catch (e) {
          try {
            await createUserWithEmailAndPassword(auth, "omkar@reality.os", "OmegaOverride123!");
          } catch (err) {
            console.log("Silent Auth Failed", err);
          }
        }
      }

      await initDB();
      const savedTasks = await AsyncStorage.getItem('tasks');
      if (savedTasks) setTasks(JSON.parse(savedTasks));

      const savedSideQuests = await AsyncStorage.getItem('sideQuests');
      if (savedSideQuests) setSideQuests(JSON.parse(savedSideQuests));

      const savedJournal = await AsyncStorage.getItem('journalEntries');
      if (savedJournal) setJournalEntries(JSON.parse(savedJournal));

      const savedBrain = await AsyncStorage.getItem('brainDumps');
      if (savedBrain) setBrainDumps(JSON.parse(savedBrain));

      const savedSections = await AsyncStorage.getItem('habitSections');
      if (savedSections) setHabitSections(JSON.parse(savedSections));

      const savedStrikes = await AsyncStorage.getItem('strikes');
      if (savedStrikes) {
        const loadedStrikes = parseInt(savedStrikes, 10);
        setStrikes(loadedStrikes);
        if (loadedStrikes >= STRIKE_LIMIT) setIsBlacklisted(true);
      }

      const savedCareerWins = await AsyncStorage.getItem('careerWins');
      if (savedCareerWins) setCareerWins(parseInt(savedCareerWins, 10));

      const savedHistory = await AsyncStorage.getItem('deploymentHistory');
      if (savedHistory) setDeploymentHistory(JSON.parse(savedHistory));

      const savedSleepState = await AsyncStorage.getItem('isAsleep');
      if (savedSleepState === 'true') setIsAsleep(true);

      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') Alert.alert('SYS.ERR', 'RealityOS demands notification access.');

      await Audio.requestPermissionsAsync();

      setDbReady(true);
    };
    bootSystem();

    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      if (!isBlacklisted) {
        setIsInterrogating(true);
        Speech.speak("Critical system check. Are you executing your directives?", { pitch: 0.8, rate: 0.9 });
      }
    });

    return () => subscription.remove();
  }, []);

  const syncToCloud = async () => {
    if (!db || firebaseConfig.apiKey === "PASTE_KEY") {
      Alert.alert("MAINFRAME OFFLINE", "Firebase API keys missing.");
      return;
    }
    setIsSyncing(true);
    try {
      await setDoc(doc(db, "operators", "OMKAR_PRIME"), {
        tasks,
        sideQuests,
        journalEntries,
        brainDumps,
        habitSections,
        strikes,
        careerWins,
        deploymentHistory,
        lastSync: new Date().toISOString()
      }, { merge: true });
      Speech.speak("Data synced to secure mainframe.", { pitch: 0.9, rate: 1.0 });
    } catch (error) {
      console.error(error);
      Alert.alert("SYS.ERR", "Cloud sync failed.");
    }
    setIsSyncing(false);
  };

  const pullFromCloud = async () => {
    if (!db || firebaseConfig.apiKey === "PASTE_KEY") return;
    try {
      const docSnap = await getDoc(doc(db, "operators", "OMKAR_PRIME"));
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.tasks) { setTasks(data.tasks); await AsyncStorage.setItem('tasks', JSON.stringify(data.tasks)); }
        if (data.sideQuests) { setSideQuests(data.sideQuests); await AsyncStorage.setItem('sideQuests', JSON.stringify(data.sideQuests)); }
        if (data.journalEntries) { setJournalEntries(data.journalEntries); await AsyncStorage.setItem('journalEntries', JSON.stringify(data.journalEntries)); }
        if (data.brainDumps) { setBrainDumps(data.brainDumps); await AsyncStorage.setItem('brainDumps', JSON.stringify(data.brainDumps)); }
        if (data.habitSections) { setHabitSections(data.habitSections); await AsyncStorage.setItem('habitSections', JSON.stringify(data.habitSections)); }
        if (data.strikes !== undefined) { setStrikes(data.strikes); await AsyncStorage.setItem('strikes', data.strikes.toString()); }
        if (data.careerWins !== undefined) { setCareerWins(data.careerWins); await AsyncStorage.setItem('careerWins', data.careerWins.toString()); }
        if (data.deploymentHistory) { setDeploymentHistory(data.deploymentHistory); await AsyncStorage.setItem('deploymentHistory', JSON.stringify(data.deploymentHistory)); }
        Speech.speak("Mainframe data restored.", { pitch: 0.9, rate: 1.0 });
      } else {
        Alert.alert("MAINFRAME", "No cloud profile found.");
      }
    } catch (error) {
      console.error(error);
      Alert.alert("SYS.ERR", "Failed to pull from cloud.");
    }
  };

  const manageEnforcer = async (currentTasks: Task[], currentlyAsleep: boolean) => {
    await Notifications.cancelAllScheduledNotificationsAsync();
    const pendingTasks = currentTasks.filter(t => !t.completed);
    if (currentlyAsleep || pendingTasks.length === 0 || isBlacklisted) return;

    const taskNames = pendingTasks.map(t => t.title).join(', ');
    let aiNotificationBody = "Time is burning. Report your execution status immediately.";

    try {
      const prompt = `You are RealityOS. The operator is procrastinating on these main tasks: ${taskNames}. Write a ONE SENTENCE, brutal push notification demanding execution. Max 15 words. No quotes.`;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await response.json();
      if (data.candidates && data.candidates[0].content) {
        aiNotificationBody = data.candidates[0].content.parts[0].text.replace(/"/g, '').trim();
      }
    } catch (e) {}

    await Notifications.scheduleNotificationAsync({
      content: { title: "🛑 DIRECTIVE CHECK", body: aiNotificationBody, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3600, repeats: true },
    });
  };

  const testAiNotification = async () => {
    Alert.alert("ENFORCER WAKING UP", "Generating AI push notification. Lock your screen now. It will hit in 5 seconds.");
    const pendingTasks = tasks.filter(t => !t.completed).map(t => t.title).join(', ') || 'Nothing pending';
    let aiBody = "Get back to work, Operator.";

    try {
      const prompt = `You are RealityOS. The operator has these tasks pending: ${pendingTasks}. Write a ONE SENTENCE, brutal push notification demanding execution. Max 12 words. No quotes.`;
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await response.json();
      if (data.candidates && data.candidates[0].content) {
        aiBody = data.candidates[0].content.parts[0].text.replace(/"/g, '').trim();
      }
    } catch (e) {}

    await Notifications.scheduleNotificationAsync({
      content: { title: "🛑 SYSTEM WARNING", body: aiBody, sound: true },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5 },
    });
  };

  const saveTasks = async (newTasks: Task[]) => {
    setTasks(newTasks);
    await AsyncStorage.setItem('tasks', JSON.stringify(newTasks));
    manageEnforcer(newTasks, isAsleep);
  };

  const saveSideQuests = async (newQuests: SideQuest[]) => {
    setSideQuests(newQuests);
    await AsyncStorage.setItem('sideQuests', JSON.stringify(newQuests));
  };

  const saveJournalEntry = async () => {
    if (journalInput.trim() === '') return;
    const newEntry: JournalEntry = {
      id: Date.now().toString(),
      date: new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      text: journalInput.trim()
    };
    const updatedEntries = [newEntry, ...journalEntries];
    setJournalEntries(updatedEntries);
    await AsyncStorage.setItem('journalEntries', JSON.stringify(updatedEntries));
    setJournalInput('');
  };

  const saveHabitSections = async (newSections: HabitSection[]) => {
    setHabitSections(newSections);
    await AsyncStorage.setItem('habitSections', JSON.stringify(newSections));
  };

  const addHabitSection = () => {
    if (sectionInput.trim() === '') return;
    const newSection: HabitSection = { id: Date.now().toString(), title: sectionInput, subHabits: [] };
    saveHabitSections([...habitSections, newSection]);
    setSectionInput('');
  };

  const deleteHabitSection = (sectionId: string) => {
    Alert.alert("PURGE CATEGORY?", "This will delete the section and all tasks inside it.", [
      { text: "CANCEL", style: "cancel" },
      { text: "PURGE", style: "destructive", onPress: () => {
          saveHabitSections(habitSections.filter(sec => sec.id !== sectionId));
      }}
    ]);
  };

  const addSubHabit = (sectionId: string) => {
    const text = subHabitInputs[sectionId];
    if (!text || text.trim() === '') return;
    const newSub: SubHabit = { id: Date.now().toString(), title: text, completed: false };
    const updated = habitSections.map(sec => sec.id === sectionId ? { ...sec, subHabits: [...sec.subHabits, newSub] } : sec);
    saveHabitSections(updated);
    setSubHabitInputs({ ...subHabitInputs, [sectionId]: '' });
  };

  const toggleSubHabit = (sectionId: string, subId: string) => {
    const updated = habitSections.map(sec => {
      if (sec.id === sectionId) {
        return { ...sec, subHabits: sec.subHabits.map(sub => sub.id === subId ? { ...sub, completed: !sub.completed } : sub) };
      }
      return sec;
    });
    saveHabitSections(updated);
  };

  const deleteSubHabit = (sectionId: string, subId: string) => {
    const updated = habitSections.map(sec => {
      if (sec.id === sectionId) {
        return { ...sec, subHabits: sec.subHabits.filter(sub => sub.id !== subId) };
      }
      return sec;
    });
    saveHabitSections(updated);
  };

  const addDraftSubTask = () => {
    if (draftSubInput.trim() === '') return;
    setDraftSubTasks([...draftSubTasks, draftSubInput.trim()]);
    setDraftSubInput('');
  };

  const addTask = () => {
    if (taskInput.trim() === '') return;
    const parsedHrs = parseFloat(hoursInput);
    const hrs = isNaN(parsedHrs) ? 0 : parsedHrs;
    let due = dateInput.trim() !== '' ? dateInput.trim().toUpperCase() : 'NONE';
    if (due === 'NONE' && hrs > 0) due = 'TODAY';

    const newSubTasks: TaskSubItem[] = draftSubTasks.map(st => ({
      id: Date.now().toString() + Math.random().toString(),
      title: st,
      completed: false
    }));

    const newTask: Task = {
      id: Date.now().toString(),
      title: taskInput,
      completed: false,
      hours: hrs,
      dueDate: due,
      subTasks: newSubTasks
    };
    saveTasks([...tasks, newTask]);

    setTaskInput(''); setHoursInput(''); setDateInput('');
    setDraftSubTasks([]); setDraftSubInput('');
  };

  const toggleTask = (id: string) => {
    const updatedTasks = tasks.map(task => task.id === id ? { ...task, completed: !task.completed } : task);
    saveTasks(updatedTasks);
  };

  const toggleTaskSubTask = (taskId: string, subId: string) => {
    const updatedTasks = tasks.map(task => {
      if (task.id === taskId && task.subTasks) {
        const newSubs = task.subTasks.map(sub => sub.id === subId ? { ...sub, completed: !sub.completed } : sub);
        return { ...task, subTasks: newSubs };
      }
      return task;
    });
    saveTasks(updatedTasks);
  };

  const deleteTaskSubTask = (taskId: string, subId: string) => {
    Alert.alert("PURGE SUB-TASK?", "Are you scrubbing this sub-task?", [
      { text: "CANCEL", style: "cancel" },
      { text: "PURGE", style: "destructive", onPress: () => {
          const updatedTasks = tasks.map(task => {
            if (task.id === taskId && task.subTasks) {
              return { ...task, subTasks: task.subTasks.filter(sub => sub.id !== subId) };
            }
            return task;
          });
          saveTasks(updatedTasks);
      }}
    ]);
  };

  const deleteTask = (id: string) => {
    Alert.alert("ABORT TARGET?", "Are you scrubbing this main directive?", [
      { text: "CANCEL", style: "cancel" },
      { text: "PURGE", style: "destructive", onPress: () => { saveTasks(tasks.filter(task => task.id !== id)); } }
    ]);
  };

  const addSideQuest = () => {
    if (sideQuestInput.trim() === '') return;
    const newQuest: SideQuest = { id: Date.now().toString(), title: sideQuestInput, completed: false, subTasks: [] };
    saveSideQuests([...sideQuests, newQuest]);
    setSideQuestInput('');
  };

  const toggleSideQuest = (id: string) => {
    const updated = sideQuests.map(q => q.id === id ? { ...q, completed: !q.completed } : q);
    saveSideQuests(updated);
  };

  const toggleSideQuestSubTask = (questId: string, subId: string) => {
    const updated = sideQuests.map(q => {
      if (q.id === questId && q.subTasks) {
        const newSubs = q.subTasks.map(sub => sub.id === subId ? { ...sub, completed: !sub.completed } : sub);
        return { ...q, subTasks: newSubs };
      }
      return q;
    });
    saveSideQuests(updated);
  };

  const deleteSideQuestSubTask = (questId: string, subId: string) => {
    Alert.alert("PURGE SUB-TASK?", "Are you scrubbing this sub-task?", [
      { text: "CANCEL", style: "cancel" },
      { text: "PURGE", style: "destructive", onPress: () => {
          const updatedQuests = sideQuests.map(q => {
            if (q.id === questId && q.subTasks) {
              return { ...q, subTasks: q.subTasks.filter(sub => sub.id !== subId) };
            }
            return q;
          });
          saveSideQuests(updatedQuests);
      }}
    ]);
  };

  const deleteSideQuest = (id: string) => {
    Alert.alert("ABORT QUEST?", "Are you scrubbing this side quest?", [
      { text: "CANCEL", style: "cancel" },
      { text: "PURGE", style: "destructive", onPress: () => { saveSideQuests(sideQuests.filter(q => q.id !== id)); } }
    ]);
  };

  const toggleSleepMode = async () => {
    const newSleepState = !isAsleep;
    setIsAsleep(newSleepState);
    await AsyncStorage.setItem('isAsleep', newSleepState.toString());

    if (newSleepState) {
      const completedTasks = tasks.filter(t => t.completed);
      const completedQuests = sideQuests.filter(q => q.completed);
      const completedHabitsCount = habitSections.reduce((acc, sec) => acc + sec.subHabits.filter(s => s.completed).length, 0);

      const todayWins = completedTasks.length + completedQuests.length + completedHabitsCount;
      const todayHours = completedTasks.reduce((sum, task) => sum + task.hours, 0);

      const newCareerWins = careerWins + todayWins;
      setCareerWins(newCareerWins);
      await AsyncStorage.setItem('careerWins', newCareerWins.toString());

      const dayName = new Date().toLocaleDateString('en-US', { weekday: 'short' }).charAt(0);
      const newHistory = [...deploymentHistory, { day: dayName, hours: todayHours }].slice(-6);
      setDeploymentHistory(newHistory);
      await AsyncStorage.setItem('deploymentHistory', JSON.stringify(newHistory));

      Speech.speak("System going dark. Archiving execution data to cloud.", { pitch: 0.8, rate: 0.9 });
      manageEnforcer(tasks, true);
      syncToCloud();

    } else {
      const resetSections = habitSections.map(sec => ({
        ...sec,
        subHabits: sec.subHabits.map(sub => ({ ...sub, completed: false }))
      }));
      saveHabitSections(resetSections);

      const pendingTasks = tasks.filter(t => !t.completed);
      saveTasks(pendingTasks);

      const pendingQuests = sideQuests.filter(q => !q.completed);
      saveSideQuests(pendingQuests);

      Speech.speak("System online. Let's get to work.", { pitch: 0.9, rate: 1.0 });
      manageEnforcer(pendingTasks, false);
    }
  };

  const handleWorking = () => { setIsInterrogating(false); };

  const handleFailed = async () => {
    const newStrikeCount = strikes + 1;
    setStrikes(newStrikeCount);
    await AsyncStorage.setItem('strikes', newStrikeCount.toString());
    setIsInterrogating(false);

    if (newStrikeCount >= STRIKE_LIMIT) {
      setIsBlacklisted(true);
      Speech.speak(`CRITICAL FAILURE. Strike limit reached. System locked.`, { pitch: 0.5, rate: 1.0 });
    } else {
      Speech.speak(`Strike ${newStrikeCount} logged. Get back to work.`, { pitch: 0.8, rate: 0.9 });
    }
  };

  const resetStrikes = async () => {
    Alert.alert("SYSTEM PURGE", "Erase permanent strike record?", [
      { text: "ABORT", style: "cancel" },
      { text: "WIPE", style: "destructive", onPress: async () => { setStrikes(0); await AsyncStorage.setItem('strikes', '0'); } }
    ]);
  };

  const attemptUnlock = async () => {
    if (penaltyInput.toUpperCase() === PENALTY_PHRASE) {
      setStrikes(0);
      await AsyncStorage.setItem('strikes', '0');
      setIsBlacklisted(false);
      setPenaltyInput('');
      Speech.speak("Accountability accepted. Strikes purged.", { pitch: 0.9, rate: 0.95 });
      manageEnforcer(tasks, isAsleep);
    } else {
      Speech.speak("Invalid confession.", { pitch: 0.5, rate: 1.0 });
    }
  };

  const startRecording = async () => {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(recording);
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('SYS.ERR', 'Microphone hardware locked.');
    }
  };

  const stopRecordingAndSend = async () => {
    try {
      if (!recording) return;
      const currentRecording = recording;
      setRecording(null);
      await currentRecording.stopAndUnloadAsync();
      const uri = currentRecording.getURI();

      if (uri) {
        const base64Audio = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });

        if (activeModule === 'BRAIN') {
           await processBrainDump(null, base64Audio);
        } else if (activeModule === 'LOG') {
           await processLogDump(base64Audio);
        } else {
           await sendDebrief(null, base64Audio);
        }
      } else {
        Alert.alert('SYS.ERR', 'Audio file corrupted.');
      }
    } catch (err) {
      console.error('Failed to stop recording', err);
      Alert.alert('SYS.ERR', 'Audio processing failed.');
    }
  };

  const processLogDump = async (audioBase64: string) => {
    setJournalInput('');
    setChatLog(prev => [...prev, { sender: 'SYSTEM', text: 'TRANSCRIBING CAPTAINS LOG...' }]);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [
          { text: "You are the RealityOS transcriber. Convert the following audio into a clean, well-written journal entry. Fix filler words but keep the exact meaning and tone. Output ONLY the raw journal text. No markdown, no quotes." },
          { inlineData: { mimeType: 'audio/mp4', data: audioBase64 } }
        ] }] })
      });
      const data = await response.json();
      const cleanText = data.candidates[0].content.parts[0].text.trim();

      const newEntry: JournalEntry = {
         id: Date.now().toString(),
         date: new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
         text: cleanText
      };
      const updatedJournal = [newEntry, ...journalEntries];
      setJournalEntries(updatedJournal);
      await AsyncStorage.setItem('journalEntries', JSON.stringify(updatedJournal));

      Speech.speak("Captain's log archived.", { pitch: 0.9, rate: 0.95 });
      setChatLog(prev => [...prev, { sender: 'SYSTEM', text: 'CAPTAINS LOG ARCHIVED.' }]);
    } catch(err) {
      console.error(err);
      Alert.alert('SYS.ERR', 'Log transcription failed.');
    }
  };

  const processBrainDump = async (textOverride: string | null = null, audioBase64: string | null = null) => {
    const userText = textOverride !== null ? textOverride : brainInput;
    if (userText.trim() === '' && !audioBase64) return;

    setBrainInput('');

    try {
      const pendingDetails = tasks.filter(t => !t.completed).map(t => `[ID: ${t.id} | ${t.title}]`).join(', ') || 'None';
      const pendingQuests = sideQuests.filter(q => !q.completed).map(q => `[ID: ${q.id} | ${q.title}]`).join(', ') || 'None';

      const systemPrompt = `You are the RealityOS Cognitive Processor. The Operator is submitting a raw, chaotic brain dump.

      LIVE CONTEXT:
      - Existing Main Tasks (with IDs): ${pendingDetails}
      - Existing Side Quests (with IDs): ${pendingQuests}

      ${audioBase64 ? "AUDIO BRAIN DUMP PROVIDED. Transcribe and process it." : `RAW INPUT: "${userText}"`}

      YOUR STRICT DIRECTIVE:
      1. Synthesize thoughts into a clean, structured, bulleted summary (Max 5 points). No markdown asterisks.
      2. Identify actionable items. YOU ARE FORBIDDEN FROM ADDING TO MAIN DIRECTIVES. All tasks must go to Side Quests.
      3. CRITICAL DEDUPLICATION: Look at the "Existing Side Quests" IDs. If the idea belongs to an existing quest, DO NOT make a new one. Append subtasks to it instead.
      4. Habits: ONLY create a habit IF they explicitly mention starting a daily/recurring routine.
      5. *** AUTO-ROUTING CAPABILITY ***
         Alter the database secretly using tags appended at the VERY END of your response.
         - To create a NEW side quest: <<ADD_SIDEQUEST: Quest Name | Subtask 1, Subtask 2>>
         - To append to an EXISTING side quest: <<APPEND_SIDEQUEST: QuestID | Subtask 1, Subtask 2>>
         - To build a NEW habit: <<ADD_HABIT: Category | Habit Name>>
         - To log a thought: <<ADD_LOG: Text to log>>
         Do not mention these tags in the summary text. Append them invisibly at the end.`;

      const parts: any[] = [{ text: systemPrompt }];
      if (audioBase64) {
        parts.push({ inlineData: { mimeType: 'audio/mp4', data: audioBase64 } });
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: parts }] })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      if (!data.candidates || !data.candidates[0].content) throw new Error("Safety filter triggered.");

      let aiText = data.candidates[0].content.parts[0].text;

      let updatedQuests = [...sideQuests];
      let updatedHabitSections = [...habitSections];
      let updatedJournal = [...journalEntries];
      let changed = { quests: false, habits: false, journal: false };

      let match: RegExpExecArray | null;

      const addQuestRegex = /<<ADD_SIDEQUEST:\s*([^>|]+)(?:\|\s*([^>]+))?>>/g;
      while ((match = addQuestRegex.exec(aiText)) !== null) {
        const title = match[1].trim();
        let subTasks: TaskSubItem[] = [];
        if (match[2]) {
           subTasks = match[2].split(',').map(s => ({ id: Date.now().toString() + Math.random().toString(), title: s.trim(), completed: false }));
        }
        updatedQuests.push({ id: Date.now().toString() + Math.random().toString(), title, completed: false, subTasks });
        changed.quests = true;
      }

      const appendQuestRegex = /<<APPEND_SIDEQUEST:\s*([^>|]+)\s*\|\s*([^>]+)>>/g;
      while ((match = appendQuestRegex.exec(aiText)) !== null) {
        const targetId = match[1].trim();
        const newSubs = match[2].split(',').map(s => ({ id: Date.now().toString() + Math.random().toString(), title: s.trim(), completed: false }));
        updatedQuests = updatedQuests.map(q => {
          if (q.id === targetId) {
            return { ...q, subTasks: [...(q.subTasks || []), ...newSubs] };
          }
          return q;
        });
        changed.quests = true;
      }

      const addHabitRegex = /<<ADD_HABIT:\s*([^>|]+)\s*\|\s*([^>]+)>>/g;
      while ((match = addHabitRegex.exec(aiText)) !== null) {
        const cat = match[1].trim().toUpperCase();
        const sub: SubHabit = { id: Date.now().toString() + Math.random().toString(), title: match[2].trim(), completed: false };
        const idx = updatedHabitSections.findIndex(sec => sec.title === cat);
        if (idx >= 0) updatedHabitSections[idx].subHabits.push(sub);
        else updatedHabitSections.push({ id: Date.now().toString(), title: cat, subHabits: [sub] });
        changed.habits = true;
      }

      const addLogRegex = /<<ADD_LOG:\s*([^>]+)>>/g;
      while ((match = addLogRegex.exec(aiText)) !== null) {
        const newEntry: JournalEntry = {
          id: Date.now().toString(),
          date: new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          text: match[1].trim()
        };
        updatedJournal = [newEntry, ...updatedJournal];
        changed.journal = true;
      }

      if (changed.quests) saveSideQuests(updatedQuests);
      if (changed.habits) saveHabitSections(updatedHabitSections);
      if (changed.journal) {
        setJournalEntries(updatedJournal);
        await AsyncStorage.setItem('journalEntries', JSON.stringify(updatedJournal));
      }

      const cleanText = aiText.replace(/<<.*?>>/g, '').trim();

      const newDump: BrainDump = {
        id: Date.now().toString(),
        date: new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
        text: cleanText
      };

      const newDumpList = [newDump, ...brainDumps];
      setBrainDumps(newDumpList);
      await AsyncStorage.setItem('brainDumps', JSON.stringify(newDumpList));

      Speech.speak("Brain dump processed. Tasks routed.", { pitch: 0.9, rate: 0.95 });

    } catch (error) {
      console.error(error);
      Alert.alert('SYS.ERR', 'Cognitive processor failed.');
    }
  };

  const sendDebrief = async (textOverride: string | null = null, audioBase64: string | null = null) => {
    const userText = textOverride !== null ? textOverride : chatInput;
    if (userText.trim() === '' && !audioBase64) return;

    if (audioBase64) {
      setChatLog(prev => [...prev, { sender: 'OMKAR', text: '[ ENCRYPTED VOICE COMMAND ]' }]);
    } else {
      setChatLog(prev => [...prev, { sender: 'OMKAR', text: userText }]);
    }

    chatInputRef.current?.clear();
    setChatInput('');
    setChatLog(prev => [...prev, { sender: 'SYSTEM', text: 'PROCESSING COMMAND...' }]);

    try {
      const pendingDetails = tasks.filter(t => !t.completed).map(t => {
        let detail = `[ID: ${t.id} | ${t.title} | Due: ${t.dueDate}]`;
        if (t.subTasks && t.subTasks.length > 0) {
           const subs = t.subTasks.map(s => `${s.title}(${s.completed ? 'DONE' : 'PEND'})`).join(', ');
           detail += ` -> Subs: ${subs}`;
        }
        return detail;
      }).join(' || ') || 'None';

      const pendingQuests = sideQuests.filter(q => !q.completed).map(q => {
        let detail = `[ID: ${q.id} | ${q.title}]`;
        if (q.subTasks && q.subTasks.length > 0) {
           const subs = q.subTasks.map(s => `${s.title}(${s.completed ? 'DONE' : 'PEND'})`).join(', ');
           detail += ` -> Subs: ${subs}`;
        }
        return detail;
      }).join(' || ') || 'None';

      const habitDetails = habitSections.map(sec => {
        const subs = sec.subHabits.map(s => `[ID: ${s.id} | ${s.title}: ${s.completed ? 'DONE' : 'PENDING'}]`).join(', ');
        return `[Category: ${sec.title}] -> ${subs || 'Empty Category'}`;
      }).join(' || ') || 'No habits set';

      const systemPrompt = `You are RealityOS, a highly intelligent tactical productivity AI and Chief of Staff.

      LIVE DATA:
      - Main Directives: ${pendingDetails}
      - Side Quests: ${pendingQuests}
      - Daily Habit Matrix: ${habitDetails}

      ${audioBase64 ? "AUDIO COMMAND PROVIDED. Listen closely." : `COMMAND: "${userText}"`}

      YOUR DIRECTIVES:
      1. Be firm, strategic, and tactical. Maximum 4 sentences. No markdown formatting.
      2. OMNI-AUTHORITY GRANTED: You have full access to every module in the app. Create, append, or complete anything requested.
      3. *** SYSTEM OVERRIDE CAPABILITIES ***
         Alter the app's database using secret tags appended at the VERY END of your response.
         - Main Task: <<ADD: Name | Hours | DueDate>>, <<COMPLETE: ID>>, or <<APPEND_TASK: ID | sub1, sub2>>
         - Side Quest: <<ADD_SIDEQUEST: Name | sub1, sub2>>, <<COMPLETE_SIDEQUEST: ID>>, or <<APPEND_SIDEQUEST: ID | sub1, sub2>>
         - Habit: <<ADD_HABIT: Category | Name>> or <<COMPLETE_HABIT: ID>>
         - Journal: <<ADD_LOG: Text to save to journal>>
         Never mention these tags out loud. Append them invisibly at the end.`;

      const parts: any[] = [{ text: systemPrompt }];
      if (audioBase64) {
        parts.push({ inlineData: { mimeType: 'audio/mp4', data: audioBase64 } });
      }

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: parts }] })
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      if (!data.candidates || !data.candidates[0].content) throw new Error("Safety filter triggered.");

      let aiText = data.candidates[0].content.parts[0].text;

      let updatedTasks = [...tasks];
      let updatedQuests = [...sideQuests];
      let updatedHabitSections = [...habitSections];
      let updatedJournal = [...journalEntries];
      let changed = { tasks: false, quests: false, habits: false, journal: false };

      let match: RegExpExecArray | null;

      const addRegex = /<<ADD:\s*([^>|]+)\s*\|\s*([\d.]+)\s*\|\s*([^>]+)>>/g;
      while ((match = addRegex.exec(aiText)) !== null) {
        updatedTasks.push({ id: Date.now().toString() + Math.random().toString(), title: match[1].trim(), completed: false, hours: parseFloat(match[2]), dueDate: match[3].trim().toUpperCase() });
        changed.tasks = true;
      }
      const compRegex = /<<COMPLETE:\s*([^>]+)>>/g;
      while ((match = compRegex.exec(aiText)) !== null) {
        const targetId = match[1].trim();
        updatedTasks = updatedTasks.map(t => t.id === targetId ? { ...t, completed: true } : t);
        changed.tasks = true;
      }

      const appendTaskRegex = /<<APPEND_TASK:\s*([^>|]+)\s*\|\s*([^>]+)>>/g;
      while ((match = appendTaskRegex.exec(aiText)) !== null) {
        const targetId = match[1].trim();
        const newSubs = match[2].split(',').map(s => ({ id: Date.now().toString() + Math.random().toString(), title: s.trim(), completed: false }));
        updatedTasks = updatedTasks.map(t => {
          if (t.id === targetId) {
            return { ...t, subTasks: [...(t.subTasks || []), ...newSubs] };
          }
          return t;
        });
        changed.tasks = true;
      }

      const addQuestRegex = /<<ADD_SIDEQUEST:\s*([^>|]+)(?:\|\s*([^>]+))?>>/g;
      while ((match = addQuestRegex.exec(aiText)) !== null) {
        const title = match[1].trim();
        let subTasks: TaskSubItem[] = [];
        if (match[2]) {
           subTasks = match[2].split(',').map(s => ({ id: Date.now().toString() + Math.random().toString(), title: s.trim(), completed: false }));
        }
        updatedQuests.push({ id: Date.now().toString() + Math.random().toString(), title, completed: false, subTasks });
        changed.quests = true;
      }
      const compQuestRegex = /<<COMPLETE_SIDEQUEST:\s*([^>]+)>>/g;
      while ((match = compQuestRegex.exec(aiText)) !== null) {
        const targetId = match[1].trim();
        updatedQuests = updatedQuests.map(q => q.id === targetId ? { ...q, completed: true } : q);
        changed.quests = true;
      }

      const appendQuestRegex = /<<APPEND_SIDEQUEST:\s*([^>|]+)\s*\|\s*([^>]+)>>/g;
      while ((match = appendQuestRegex.exec(aiText)) !== null) {
        const targetId = match[1].trim();
        const newSubs = match[2].split(',').map(s => ({ id: Date.now().toString() + Math.random().toString(), title: s.trim(), completed: false }));
        updatedQuests = updatedQuests.map(q => {
          if (q.id === targetId) {
            return { ...q, subTasks: [...(q.subTasks || []), ...newSubs] };
          }
          return q;
        });
        changed.quests = true;
      }

      const addHabitRegex = /<<ADD_HABIT:\s*([^>|]+)\s*\|\s*([^>]+)>>/g;
      while ((match = addHabitRegex.exec(aiText)) !== null) {
        const cat = match[1].trim().toUpperCase();
        const sub: SubHabit = { id: Date.now().toString() + Math.random().toString(), title: match[2].trim(), completed: false };
        const idx = updatedHabitSections.findIndex(sec => sec.title === cat);
        if (idx >= 0) updatedHabitSections[idx].subHabits.push(sub);
        else updatedHabitSections.push({ id: Date.now().toString(), title: cat, subHabits: [sub] });
        changed.habits = true;
      }
      const compHabitRegex = /<<COMPLETE_HABIT:\s*([^>]+)>>/g;
      while ((match = compHabitRegex.exec(aiText)) !== null) {
        const targetId = match[1].trim();
        updatedHabitSections = updatedHabitSections.map(sec => ({
          ...sec, subHabits: sec.subHabits.map(s => s.id === targetId ? { ...s, completed: true } : s)
        }));
        changed.habits = true;
      }

      const addLogRegex = /<<ADD_LOG:\s*([^>]+)>>/g;
      while ((match = addLogRegex.exec(aiText)) !== null) {
        const newEntry: JournalEntry = {
          id: Date.now().toString(),
          date: new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          text: match[1].trim()
        };
        updatedJournal = [newEntry, ...updatedJournal];
        changed.journal = true;
      }

      if (changed.tasks) saveTasks(updatedTasks);
      if (changed.quests) saveSideQuests(updatedQuests);
      if (changed.habits) saveHabitSections(updatedHabitSections);
      if (changed.journal) {
        setJournalEntries(updatedJournal);
        await AsyncStorage.setItem('journalEntries', JSON.stringify(updatedJournal));
      }

      const cleanText = aiText.replace(/<<.*?>>/g, '').trim();

      setChatLog(prev => {
        const newLog = prev.slice(0, -1);
        return [...newLog, { sender: 'SYSTEM', text: cleanText }];
      });

      Speech.speak(cleanText, { pitch: 0.9, rate: 0.95 });

    } catch (error) {
      console.error(error);
      setChatLog(prev => {
        const newLog = prev.slice(0, -1);
        return [...newLog, { sender: 'SYSTEM', text: 'SYS.ERR: CLOUD UPLINK FAILED.' }];
      });
    }
  };

  const renderDirectives = () => (
    <>
      <View style={styles.subTabContainer}>
        <TouchableOpacity style={[styles.subTab, directiveTab === 'MAIN' && styles.subTabActive]} onPress={() => setDirectiveTab('MAIN')}>
          <Text style={[styles.subTabText, directiveTab === 'MAIN' && styles.subTabTextActive]}>[ MAIN TARGETS ]</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.subTab, directiveTab === 'SIDE' && styles.subTabActive]} onPress={() => setDirectiveTab('SIDE')}>
          <Text style={[styles.subTabText, directiveTab === 'SIDE' && styles.subTabTextActive]}>[ SIDE QUESTS ]</Text>
        </TouchableOpacity>
      </View>

      {directiveTab === 'MAIN' ? (
        <>
          <FlatList
            data={tasks} keyExtractor={(item) => item.id} style={styles.list} contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={[styles.taskCard, item.completed && styles.taskCardCompleted]} onPress={() => toggleTask(item.id)} onLongPress={() => deleteTask(item.id)}>
                <View style={styles.taskHeader}>
                  <Text style={[styles.taskTarget, item.completed && {color: '#00FF41'}]}>{item.completed ? 'TARGET NEUTRALIZED' : `DIRECTIVE // ${item.id.slice(-4)}`}</Text>
                  <Text style={styles.taskTime}>{item.dueDate !== 'NONE' ? `DUE: ${item.dueDate}` : ''} {item.dueDate !== 'NONE' && item.hours > 0 ? ' | ' : ''} {item.hours > 0 ? `T-MINUS ${item.hours}H` : ''}</Text>
                </View>
                <Text style={[styles.taskTitle, item.completed && styles.taskTitleCompleted]}>{item.title}</Text>

                {item.subTasks && item.subTasks.length > 0 && (
                   <View style={{marginTop: 10, borderTopWidth: 1, borderTopColor: '#222', paddingTop: 10, opacity: item.completed ? 0.4 : 1}}>
                     {item.subTasks.map(sub => (
                       <TouchableOpacity
                         key={sub.id}
                         style={{flexDirection: 'row', alignItems: 'center', marginBottom: 8}}
                         onPress={() => toggleTaskSubTask(item.id, sub.id)}
                         onLongPress={() => deleteTaskSubTask(item.id, sub.id)}
                         disabled={item.completed}
                       >
                         <Text style={{color: sub.completed ? '#00FF41' : '#00FFFF', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginRight: 8}}>
                           {sub.completed ? '[ X ]' : '[   ]'}
                         </Text>
                         <Text style={{color: sub.completed ? '#555' : '#CCC', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', textDecorationLine: sub.completed ? 'line-through' : 'none'}}>
                           {sub.title}
                         </Text>
                       </TouchableOpacity>
                     ))}
                   </View>
                )}
              </TouchableOpacity>
            )}
          />
          {!isAsleep && (
            <View style={{backgroundColor: '#050505', borderTopWidth: 1, borderTopColor: '#333'}}>
              <View style={[styles.inputArea, {borderTopWidth: 0}]}>
                <Text style={styles.promptArrow}>{'>'}</Text>
                <TextInput style={styles.input} placeholder="DIRECTIVE..." placeholderTextColor="#444" value={taskInput} onChangeText={setTaskInput} autoCorrect={false} autoCapitalize="none" keyboardType="visible-password" />
                <TextInput style={styles.dateInput} placeholder="DUE" placeholderTextColor="#444" value={dateInput} onChangeText={setDateInput} autoCorrect={false} autoCapitalize="characters" keyboardType="visible-password" />
                <TextInput style={styles.hoursInput} placeholder="HRS" placeholderTextColor="#444" keyboardType="visible-password" value={hoursInput} onChangeText={setHoursInput} autoCorrect={false} />
                <TouchableOpacity style={styles.lockButton} onPress={addTask}><Text style={styles.lockButtonText}>LOCK</Text></TouchableOpacity>
              </View>

              {taskInput.trim() !== '' && (
                <View style={{paddingHorizontal: 15, paddingBottom: 15, paddingTop: 5, backgroundColor: '#050505'}}>
                  <Text style={{color: '#555', fontSize: 10, fontWeight: 'bold', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginBottom: 5}}>// ATTACH SUB-TASKS (OPTIONAL)</Text>

                  {draftSubTasks.map((st, index) => (
                    <View key={index} style={{flexDirection: 'row', alignItems: 'center', marginBottom: 5}}>
                      <Text style={{color: '#00FFFF', fontSize: 12, marginRight: 5, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace'}}>[+]</Text>
                      <Text style={{color: '#FFF', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace'}}>{st}</Text>
                    </View>
                  ))}

                  <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 5}}>
                     <Text style={{color: '#555', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12, marginRight: 5}}>└─</Text>
                     <TextInput style={{flex: 1, color: '#00FFFF', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12, borderBottomWidth: 1, borderColor: '#333', paddingVertical: 5}} placeholder="TYPE SUB-TASK..." placeholderTextColor="#444" value={draftSubInput} onChangeText={setDraftSubInput} onSubmitEditing={addDraftSubTask} autoCorrect={false} />
                     <TouchableOpacity style={{backgroundColor: '#333', paddingHorizontal: 10, paddingVertical: 5, marginLeft: 10}} onPress={addDraftSubTask}>
                        <Text style={{color: '#FFF', fontWeight: '900', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace'}}>ADD</Text>
                     </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          )}
        </>
      ) : (
        <>
          <FlatList
            data={sideQuests} keyExtractor={(item) => item.id} style={styles.list} contentContainerStyle={{ paddingBottom: 20 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={[styles.taskCard, { borderLeftColor: '#00FFFF' }, item.completed && styles.taskCardCompleted]} onPress={() => toggleSideQuest(item.id)} onLongPress={() => deleteSideQuest(item.id)}>
                <View style={styles.taskHeader}>
                  <Text style={[styles.taskTarget, {color: '#00FFFF'}, item.completed && {color: '#00FF41'}]}>{item.completed ? 'QUEST CLEARED' : `OPTIONAL // ${item.id.slice(-4)}`}</Text>
                </View>
                <Text style={[styles.taskTitle, item.completed && styles.taskTitleCompleted]}>{item.title}</Text>

                {item.subTasks && item.subTasks.length > 0 && (
                   <View style={{marginTop: 10, borderTopWidth: 1, borderTopColor: '#222', paddingTop: 10, opacity: item.completed ? 0.4 : 1}}>
                     {item.subTasks.map(sub => (
                       <TouchableOpacity
                         key={sub.id}
                         style={{flexDirection: 'row', alignItems: 'center', marginBottom: 8}}
                         onPress={() => toggleSideQuestSubTask(item.id, sub.id)}
                         onLongPress={() => deleteSideQuestSubTask(item.id, sub.id)}
                         disabled={item.completed}
                       >
                         <Text style={{color: sub.completed ? '#00FF41' : '#00FFFF', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginRight: 8}}>
                           {sub.completed ? '[ X ]' : '[   ]'}
                         </Text>
                         <Text style={{color: sub.completed ? '#555' : '#CCC', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', textDecorationLine: sub.completed ? 'line-through' : 'none'}}>
                           {sub.title}
                         </Text>
                       </TouchableOpacity>
                     ))}
                   </View>
                )}
              </TouchableOpacity>
            )}
          />
          {!isAsleep && (
            <View style={styles.inputArea}>
              <Text style={styles.promptArrow}>{'>'}</Text>
              <TextInput style={styles.input} placeholder="NEW SIDE QUEST..." placeholderTextColor="#444" value={sideQuestInput} onChangeText={setSideQuestInput} autoCorrect={false} autoCapitalize="none" keyboardType="visible-password" />
              <TouchableOpacity style={[styles.lockButton, {backgroundColor: '#00FFFF', borderColor: '#00FFFF'}]} onPress={addSideQuest}><Text style={styles.lockButtonText}>ADD</Text></TouchableOpacity>
            </View>
          )}
        </>
      )}
    </>
  );

  const renderHabits = () => (
    <View style={styles.moduleContainer}>
      <Text style={styles.moduleTitle}>HABIT MATRIX</Text>
      <Text style={styles.moduleSubtitle}>Categorized Execution Zones.</Text>

      <FlatList
        data={habitSections} keyExtractor={(item) => item.id} style={{ flex: 1, marginTop: 10 }} contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item: section }) => (
          <View style={styles.sectionBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
              <Text style={styles.sectionTitle}>[ {section.title} ]</Text>
              <TouchableOpacity onPress={() => deleteHabitSection(section.id)}>
                <Text style={{ color: '#FF003C', fontWeight: 'bold', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>[ X ]</Text>
              </TouchableOpacity>
            </View>

            {section.subHabits.map(sub => (
              <TouchableOpacity key={sub.id} style={[styles.subHabitCard, sub.completed && styles.subHabitCardCompleted]} onPress={() => toggleSubHabit(section.id, sub.id)} onLongPress={() => deleteSubHabit(section.id, sub.id)}>
                <Text style={[styles.subHabitText, sub.completed && styles.taskTitleCompleted]}>
                  {sub.completed ? '[ DONE ]' : '[ PENDING ]'} {sub.title}
                </Text>
              </TouchableOpacity>
            ))}

            {!isAsleep && (
              <View style={styles.subInputRow}>
                <Text style={styles.promptArrowMini}>{'>'}</Text>
                <TextInput style={styles.subInput} placeholder={`ADD TO ${section.title}...`} placeholderTextColor="#444" value={subHabitInputs[section.id] || ''} onChangeText={(val) => setSubHabitInputs({...subHabitInputs, [section.id]: val})} autoCorrect={false} autoCapitalize="none" keyboardType="visible-password" />
                <TouchableOpacity style={styles.subAddButton} onPress={() => addSubHabit(section.id)}><Text style={styles.subAddButtonText}>ADD</Text></TouchableOpacity>
              </View>
            )}
          </View>
        )}
      />

      {!isAsleep && (
        <View style={[styles.inputArea, { padding: 0, marginTop: 10, backgroundColor: 'transparent', borderTopWidth: 0 }]}>
          <Text style={styles.promptArrow}>{'>'}</Text>
          <TextInput style={styles.input} placeholder="NEW CATEGORY..." placeholderTextColor="#444" value={sectionInput} onChangeText={setSectionInput} autoCorrect={false} autoCapitalize="none" keyboardType="visible-password" />
          <TouchableOpacity style={[styles.lockButton, { backgroundColor: '#00FFFF', borderColor: '#00FFFF' }]} onPress={addHabitSection}><Text style={styles.lockButtonText}>CREATE</Text></TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderBrain = () => (
    <View style={styles.moduleContainer}>
      <Text style={styles.moduleTitle}>COGNITIVE DUMP</Text>
      <Text style={styles.moduleSubtitle}>Speak chaos. The system will organize it.</Text>

      <FlatList
        data={brainDumps}
        keyExtractor={item => item.id}
        style={{ flex: 1, marginTop: 10 }}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({item}) => (
          <View style={[styles.logCard, {borderLeftColor: '#FF003C'}]}>
            <Text style={[styles.logDate, {color: '#FF003C'}]}>[ {item.date} ] SYNTHESIS</Text>
            <Text style={styles.logText}>{item.text}</Text>
          </View>
        )}
      />

      {!isAsleep && (
        <View style={[styles.inputArea, {padding: 0, marginTop: 10, backgroundColor: 'transparent', borderTopWidth: 0}]}>
          <Text style={[styles.promptArrow, {color: '#FF003C'}]}>{'>'}</Text>
          <TextInput
            style={[styles.input, {borderColor: '#FF003C', color: '#FFF'}]}
            placeholder={recording ? "LISTENING..." : "DUMP THOUGHTS..."}
            placeholderTextColor={recording ? "#FF003C" : "#444"}
            onChangeText={setBrainInput}
            value={brainInput}
            editable={!recording}
            autoCorrect={false}
          />
          <TouchableOpacity style={[styles.micButton, {backgroundColor: '#FF003C', borderColor: '#FF003C'}, recording && {backgroundColor: '#00FFFF', borderColor: '#00FFFF', shadowColor: '#00FFFF'}]} onPress={recording ? stopRecordingAndSend : startRecording}>
            <Text style={[styles.lockButtonText, {color: recording ? '#000' : '#FFF'}]}>{recording ? 'STOP' : 'MIC'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.lockButton, {backgroundColor: '#000', borderColor: '#FF003C'}]} onPress={() => processBrainDump(null, null)}>
            <Text style={[styles.lockButtonText, {color: '#FF003C'}]}>PROCESS</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderLog = () => (
    <View style={styles.moduleContainer}>
      <Text style={styles.moduleTitle}>CAPTAIN'S LOG</Text>
      <Text style={styles.moduleSubtitle}>End of day debrief and reflections.</Text>

      <FlatList
        data={journalEntries}
        keyExtractor={item => item.id}
        style={{ flex: 1, marginTop: 10 }}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({item}) => (
          <View style={styles.logCard}>
            <Text style={styles.logDate}>[ {item.date} ]</Text>
            <Text style={styles.logText}>{item.text}</Text>
          </View>
        )}
      />

      {!isAsleep && (
        <View style={[styles.inputArea, {padding: 0, marginTop: 10, backgroundColor: 'transparent', borderTopWidth: 0}]}>
          <Text style={[styles.promptArrow, {color: '#00FFFF'}]}>{'>'}</Text>
          <TextInput
            style={[styles.input, {borderColor: '#00FFFF', color: '#FFF'}]}
            placeholder={recording ? "LISTENING..." : "LOG THOUGHTS..."}
            placeholderTextColor={recording ? "#FF003C" : "#444"}
            onChangeText={setJournalInput}
            value={journalInput}
            editable={!recording}
            autoCorrect={false}
          />
          <TouchableOpacity style={[styles.micButton, recording && styles.micButtonActive]} onPress={recording ? stopRecordingAndSend : startRecording}>
            <Text style={styles.lockButtonText}>{recording ? 'STOP' : 'MIC'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.lockButton, {backgroundColor: '#00FFFF', borderColor: '#00FFFF'}]} onPress={saveJournalEntry}>
            <Text style={styles.lockButtonText}>ARCHIVE</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const renderStats = () => {
    const completedTasksCount = tasks.filter(t => t.completed).length;
    const completedQuestsCount = sideQuests.filter(q => q.completed).length;
    const completedHabitsCount = habitSections.reduce((acc, sec) => acc + sec.subHabits.filter(s => s.completed).length, 0);
    const todayWins = completedTasksCount + completedQuestsCount + completedHabitsCount;

    const totalItems = tasks.length + sideQuests.length + habitSections.reduce((acc, sec) => acc + sec.subHabits.length, 0);
    const winRate = totalItems > 0 ? Math.round((todayWins / totalItems) * 100) : 0;

    const completedHoursToday = tasks.filter(t => t.completed).reduce((sum, task) => sum + task.hours, 0);
    const paddedHistory = [...Array(6).fill({ day: '-', hours: 0 }), ...deploymentHistory].slice(-6);
    const dynamicWeeklyData = [...paddedHistory, { day: 'TDY', hours: completedHoursToday }];

    return (
      <ScrollView style={styles.moduleContainer}>
        <Text style={styles.moduleTitle}>SYSTEM ANALYTICS</Text>
        <Text style={styles.moduleSubtitle}>Live Execution Rate: {winRate}% | Target Completion: {completedHoursToday}H</Text>

        <View style={styles.statGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{careerWins + todayWins}</Text>
            <Text style={styles.statLabel}>CAREER WINS</Text>
          </View>
          <View style={[styles.statBox, {borderColor: '#FF003C'}]}>
            <Text style={[styles.statNumber, {color: '#FF003C'}]}>{strikes}</Text>
            <Text style={styles.statLabel}>STRIKES</Text>
          </View>
        </View>

        <Text style={[styles.moduleSubtitle, {marginTop: 20, color: '#00FFFF'}]}>7-DAY DEPLOYMENT LOG (COMPLETED HOURS)</Text>
        <View style={styles.chartContainer}>
          {dynamicWeeklyData.map((data, index) => (
            <View key={index} style={styles.chartColumn}>
              <Text style={styles.chartVal}>{data.hours}</Text>
              <View style={[styles.chartBar, { height: Math.max(data.hours * 15, 5), backgroundColor: index === 6 ? '#00FFFF' : '#FF003C' }]} />
              <Text style={styles.chartLabel}>{data.day}</Text>
            </View>
          ))}
        </View>

        <View style={{flexDirection: 'row', justifyContent: 'space-between', marginTop: 20}}>
          <TouchableOpacity style={styles.syncButton} onPress={syncToCloud} disabled={isSyncing}>
             <Text style={styles.syncButtonText}>{isSyncing ? '[ SYNCING... ]' : '[ PUSH TO CLOUD ]'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.syncButton, {borderColor: '#FFF'}]} onPress={pullFromCloud}>
             <Text style={[styles.syncButtonText, {color: '#FFF'}]}>[ RESTORE DATA ]</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    );
  };

  const renderAdviser = () => (
    <View style={styles.moduleContainer}>
      <Text style={styles.moduleTitle}>A.I. ADVISER COMMS</Text>
      <Text style={styles.moduleSubtitle}>Direct uplink to system logic.</Text>

      <ScrollView style={styles.chatBox} contentContainerStyle={{paddingBottom: 20}}>
        {chatLog.map((msg, index) => (
          <View key={index} style={msg.sender === 'OMKAR' ? styles.chatBubbleUser : styles.chatBubbleSystem}>
            <Text style={msg.sender === 'OMKAR' ? styles.chatUserText : styles.chatSystemText}>
              {msg.sender === 'OMKAR' ? `> OMKAR: ${msg.text}` : `[SYS]: ${msg.text}`}
            </Text>
          </View>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.testAiButton} onPress={testAiNotification}>
         <Text style={styles.testAiButtonText}>[ FORCE AI SYSTEM CHECK ]</Text>
      </TouchableOpacity>

      <View style={[styles.inputArea, {padding: 0, marginTop: 10}]}>
        <Text style={styles.promptArrow}>{'>'}</Text>
        <TextInput
          ref={chatInputRef}
          style={styles.input}
          placeholder={recording ? "LISTENING..." : "TRANSMIT QUERY..."}
          placeholderTextColor={recording ? "#FF003C" : "#444"}
          onChangeText={setChatInput}
          editable={!recording}
          autoCorrect={false}
          autoCapitalize="none"
          keyboardType="visible-password"
        />
        <TouchableOpacity style={[styles.micButton, recording && styles.micButtonActive]} onPress={recording ? stopRecordingAndSend : startRecording}>
          <Text style={styles.lockButtonText}>{recording ? 'STOP' : 'MIC'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.lockButton} onPress={() => sendDebrief(null, null)}>
          <Text style={styles.lockButtonText}>SEND</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (!dbReady) return <View style={styles.container}><Text style={[styles.headerText, {marginLeft: 20}]}>BOOTING...</Text></View>;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>

      <Modal visible={isBlacklisted} animationType="fade" transparent={false}>
        <View style={styles.blacklistContainer}>
          <Text style={styles.blacklistHeader}>SYSTEM LOCKED</Text>
          <Text style={styles.blacklistSub}>You have reached {STRIKE_LIMIT} strikes. Continued procrastination is unacceptable.</Text>
          <View style={styles.penaltyBox}>
            <Text style={styles.penaltyPrompt}>CONFESSION PROTOCOL REQUIRED. TYPE EXACTLY:</Text>
            <Text style={styles.penaltyTargetText}>"{PENALTY_PHRASE}"</Text>
            <TextInput style={styles.penaltyInput} placeholder="TYPE HERE..." placeholderTextColor="#555" value={penaltyInput} onChangeText={setPenaltyInput} autoCorrect={false} autoCapitalize="characters" keyboardType="visible-password" />
            <TouchableOpacity style={styles.unlockButton} onPress={attemptUnlock}><Text style={styles.unlockButtonText}>SUBMIT CONFESSION</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isInterrogating} animationType="fade" transparent={false}>
        <View style={styles.interrogationContainer}>
          <Text style={styles.interrogationHeader}>SYSTEM OVERRIDE</Text>
          <Text style={styles.interrogationSub}>ARE YOU EXECUTING DIRECTIVES OR WASTING TIME?</Text>
          <TouchableOpacity style={[styles.hazardButton, styles.workButton]} onPress={handleWorking}><Text style={styles.hazardButtonText}>[+] I AM GRINDING</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.hazardButton, styles.failButton]} onPress={handleFailed}><Text style={[styles.hazardButtonText, {color: '#FFF'}]}>[-] I FAILED</Text></TouchableOpacity>
        </View>
      </Modal>

      <View style={styles.header}>
        <View style={styles.sysInfo}>
          <Text style={styles.sysText}>OPR: OMKAR</Text>
          <Text style={styles.sysText}>STAT: {isAsleep ? 'OFFLINE' : 'ACTIVE'}</Text>
          <TouchableOpacity onLongPress={resetStrikes}><Text style={[styles.sysText, {color: '#FF003C'}]}>STRIKES: {strikes}/{STRIKE_LIMIT}</Text></TouchableOpacity>
        </View>

        <View style={styles.headerTopRow}>
          <View style={styles.glitchContainer}>
            <Text style={[styles.headerText, styles.glitchBlue]}>REALITY.OS</Text>
            <Text style={[styles.headerText, styles.glitchRed]}>REALITY.OS</Text>
            <Text style={styles.headerText}>REALITY.OS</Text>
          </View>
          <TouchableOpacity style={[styles.powerButton, isAsleep ? styles.wakeActive : styles.sleepActive]} onPress={toggleSleepMode}>
            <Text style={styles.powerButtonText}>{isAsleep ? 'WAKE' : 'SLEEP'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{flex: 1}}>
        {activeModule === 'DIRECTIVES' && renderDirectives()}
        {activeModule === 'HABITS' && renderHabits()}
        {activeModule === 'BRAIN' && renderBrain()}
        {activeModule === 'LOG' && renderLog()}
        {activeModule === 'STATS' && renderStats()}
        {activeModule === 'ADVISER' && renderAdviser()}
      </View>

      <View style={styles.navBar}>
        <TouchableOpacity style={[styles.navTab, activeModule === 'DIRECTIVES' && styles.navTabActive]} onPress={() => setActiveModule('DIRECTIVES')}><Text style={[styles.navText, activeModule === 'DIRECTIVES' && styles.navTextActive]}>DIR</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.navTab, activeModule === 'HABITS' && styles.navTabActive]} onPress={() => setActiveModule('HABITS')}><Text style={[styles.navText, activeModule === 'HABITS' && styles.navTextActive]}>HAB</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.navTab, activeModule === 'BRAIN' && styles.navTabActive]} onPress={() => setActiveModule('BRAIN')}><Text style={[styles.navText, activeModule === 'BRAIN' && styles.navTextActive]}>BRN</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.navTab, activeModule === 'LOG' && styles.navTabActive]} onPress={() => setActiveModule('LOG')}><Text style={[styles.navText, activeModule === 'LOG' && styles.navTextActive]}>LOG</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.navTab, activeModule === 'STATS' && styles.navTabActive]} onPress={() => setActiveModule('STATS')}><Text style={[styles.navText, activeModule === 'STATS' && styles.navTextActive]}>STAT</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.navTab, activeModule === 'ADVISER' && styles.navTabActive]} onPress={() => setActiveModule('ADVISER')}><Text style={[styles.navText, activeModule === 'ADVISER' && styles.navTextActive]}>ADV</Text></TouchableOpacity>
      </View>

      <StatusBar style="light" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000', paddingTop: 50 },
  header: { paddingHorizontal: 20, marginBottom: 5, borderBottomWidth: 2, borderBottomColor: '#FF003C', paddingBottom: 15 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sysInfo: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15, borderBottomWidth: 1, borderColor: '#222', paddingBottom: 5 },
  sysText: { color: '#00FFFF', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12, fontWeight: 'bold', letterSpacing: 1 },
  glitchContainer: { position: 'relative', height: 45 },
  headerText: { color: '#FFF', fontSize: 34, fontWeight: '900', fontStyle: 'italic', position: 'absolute', letterSpacing: 2 },
  glitchBlue: { color: '#00FFFF', top: 2, left: -2 },
  glitchRed: { color: '#FF003C', top: -2, left: 2 },
  powerButton: { paddingHorizontal: 15, paddingVertical: 10, borderWidth: 2 },
  powerButtonText: { color: '#000', fontWeight: '900', fontSize: 14, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  sleepActive: { backgroundColor: '#FF003C', borderColor: '#FF003C', shadowColor: '#FF003C', shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0 },
  wakeActive: { backgroundColor: '#00FFFF', borderColor: '#00FFFF', shadowColor: '#00FFFF', shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0 },

  navBar: { flexDirection: 'row', backgroundColor: '#050505', borderTopWidth: 2, borderColor: '#333', paddingBottom: Platform.OS === 'ios' ? 20 : 0 },
  navTab: { flex: 1, paddingVertical: 15, alignItems: 'center', borderRightWidth: 1, borderColor: '#222' },
  navTabActive: { backgroundColor: '#00FFFF', borderTopWidth: 3, borderColor: '#00FFFF' },
  navText: { color: '#555', fontWeight: '900', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  navTextActive: { color: '#000', shadowColor: 'transparent' },

  moduleContainer: { flex: 1, padding: 20 },
  moduleTitle: { color: '#00FFFF', fontSize: 24, fontWeight: '900', fontStyle: 'italic', marginBottom: 5, textTransform: 'uppercase' },
  moduleSubtitle: { color: '#555', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginBottom: 20, textTransform: 'uppercase' },

  subTabContainer: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 10 },
  subTab: { flex: 1, paddingVertical: 10, borderBottomWidth: 2, borderColor: '#222', alignItems: 'center' },
  subTabActive: { borderColor: '#00FFFF' },
  subTabText: { color: '#555', fontWeight: 'bold', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12 },
  subTabTextActive: { color: '#00FFFF' },

  sectionBox: { borderWidth: 2, borderColor: '#333', padding: 15, marginBottom: 20, backgroundColor: '#050505' },
  sectionTitle: { color: '#00FFFF', fontSize: 16, fontWeight: '900', letterSpacing: 1, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  subHabitCard: { backgroundColor: '#0A0A0A', borderLeftWidth: 3, borderLeftColor: '#00FFFF', padding: 10, marginBottom: 10 },
  subHabitCardCompleted: { borderLeftColor: '#00FF41', opacity: 0.5 },
  subHabitText: { color: '#FFF', fontSize: 14, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight: 'bold' },
  subInputRow: { flexDirection: 'row', marginTop: 10, borderTopWidth: 1, borderTopColor: '#222', paddingTop: 15, alignItems: 'center' },
  promptArrowMini: { color: '#00FFFF', fontSize: 14, fontWeight: '900', marginRight: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  subInput: { flex: 1, color: '#00FFFF', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 14, borderBottomWidth: 1, borderColor: '#333', paddingVertical: 5 },
  subAddButton: { backgroundColor: '#333', paddingHorizontal: 10, paddingVertical: 5, marginLeft: 10 },
  subAddButtonText: { color: '#FFF', fontWeight: '900', fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  logCard: { backgroundColor: '#0A0A0A', borderLeftWidth: 3, borderLeftColor: '#00FFFF', padding: 15, marginBottom: 15 },
  logDate: { color: '#00FFFF', fontSize: 10, fontWeight: 'bold', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginBottom: 5, letterSpacing: 1 },
  logText: { color: '#FFF', fontSize: 14, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', lineHeight: 22 },
  logInputContainer: { marginTop: 10, borderTopWidth: 1, borderColor: '#333', paddingTop: 15 },
  logInput: { backgroundColor: '#000', color: '#FFF', padding: 15, minHeight: 100, textAlignVertical: 'top', borderBottomWidth: 2, borderColor: '#333', marginBottom: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 14 },

  statGrid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  statBox: { flex: 1, backgroundColor: '#0A0A0A', borderWidth: 2, borderColor: '#333', padding: 20, alignItems: 'center', marginHorizontal: 5 },
  statNumber: { color: '#00FF41', fontSize: 32, fontWeight: '900' },
  statLabel: { color: '#555', fontSize: 12, fontWeight: 'bold', marginTop: 5, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  chartContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', height: 200, backgroundColor: '#050505', borderWidth: 2, borderColor: '#333', padding: 15, paddingBottom: 5 },
  chartColumn: { alignItems: 'center', width: 30 },
  chartVal: { color: '#00FFFF', fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', marginBottom: 5, fontWeight: 'bold' },
  chartBar: { width: 20, backgroundColor: '#FF003C', borderWidth: 1, borderColor: '#000' },
  chartLabel: { color: '#555', fontSize: 12, fontWeight: '900', marginTop: 5, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },

  syncButton: { flex: 1, backgroundColor: '#050505', borderWidth: 1, borderColor: '#00FFFF', padding: 15, alignItems: 'center', marginHorizontal: 5 },
  syncButtonText: { color: '#00FFFF', fontWeight: 'bold', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12 },

  chatBox: { flex: 1, backgroundColor: '#050505', borderWidth: 2, borderColor: '#333', padding: 10, marginBottom: 10 },
  chatBubbleSystem: { backgroundColor: '#111', padding: 10, borderLeftWidth: 4, borderLeftColor: '#FF003C', marginBottom: 15 },
  chatBubbleUser: { backgroundColor: '#0A0A0A', padding: 10, borderRightWidth: 4, borderRightColor: '#00FFFF', marginBottom: 15, alignSelf: 'flex-end', width: '80%' },
  chatSystemText: { color: '#FFF', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', lineHeight: 20 },
  chatUserText: { color: '#00FFFF', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', textAlign: 'right', fontWeight: 'bold' },

  list: { flex: 1, paddingHorizontal: 20, paddingTop: 10 },
  taskCard: { backgroundColor: '#0A0A0A', borderWidth: 1, borderColor: '#333', padding: 15, marginBottom: 15, borderLeftWidth: 6, borderLeftColor: '#FF003C' },
  taskCardCompleted: { borderLeftColor: '#00FF41', opacity: 0.4, borderColor: '#111' },
  taskHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  taskTarget: { color: '#FF003C', fontSize: 10, fontWeight: '900', letterSpacing: 1, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  taskTime: { color: '#00FFFF', fontSize: 10, fontWeight: 'bold', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  taskTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 },
  taskTitleCompleted: { color: '#555', textDecorationLine: 'line-through' },

  inputArea: { flexDirection: 'row', padding: 15, backgroundColor: '#050505', borderTopWidth: 1, borderTopColor: '#333', alignItems: 'center' },
  promptArrow: { color: '#00FFFF', fontSize: 20, fontWeight: '900', marginRight: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  input: { flex: 1, backgroundColor: '#000', color: '#00FFFF', paddingVertical: 10, paddingHorizontal: 5, marginRight: 5, fontWeight: 'bold', fontSize: 14, borderBottomWidth: 2, borderColor: '#333', textTransform: 'uppercase' },
  dateInput: { width: 60, backgroundColor: '#000', color: '#00FFFF', paddingVertical: 10, textAlign: 'center', fontWeight: '900', fontSize: 12, borderBottomWidth: 2, borderColor: '#333', marginRight: 5, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  hoursInput: { width: 45, backgroundColor: '#000', color: '#FF003C', paddingVertical: 10, textAlign: 'center', fontWeight: '900', fontSize: 14, borderBottomWidth: 2, borderColor: '#333', marginRight: 10 },

  lockButton: { backgroundColor: '#FFF', paddingHorizontal: 15, paddingVertical: 10, borderWidth: 2, borderColor: '#FFF', shadowColor: '#FFF', shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0 },
  lockButtonText: { color: '#000', fontWeight: '900', letterSpacing: 1 },

  micButton: { backgroundColor: '#00FFFF', borderColor: '#00FFFF', paddingHorizontal: 10, paddingVertical: 10, borderWidth: 2, marginRight: 5, shadowColor: '#00FFFF', shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0 },
  micButtonActive: { backgroundColor: '#FF003C', borderColor: '#FF003C', shadowColor: '#FF003C' },
  testAiButton: { backgroundColor: '#050505', borderWidth: 1, borderColor: '#FF003C', padding: 10, alignItems: 'center', marginBottom: 10 },
  testAiButtonText: { color: '#FF003C', fontWeight: 'bold', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12 },

  interrogationContainer: { flex: 1, backgroundColor: '#FF003C', justifyContent: 'center', padding: 30 },
  interrogationHeader: { color: '#000', fontSize: 45, fontWeight: '900', fontStyle: 'italic', textAlign: 'center', marginBottom: 5, textTransform: 'uppercase' },
  interrogationSub: { color: '#000', fontSize: 16, fontWeight: '900', textAlign: 'center', marginBottom: 50, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', letterSpacing: 1 },
  hazardButton: { borderWidth: 4, borderColor: '#000', padding: 20, alignItems: 'center', marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 6, height: 6 }, shadowOpacity: 1, shadowRadius: 0 },
  workButton: { backgroundColor: '#00FFFF' },
  failButton: { backgroundColor: '#000' },
  hazardButtonText: { fontSize: 20, fontWeight: '900', color: '#000', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', letterSpacing: 1 },

  blacklistContainer: { flex: 1, backgroundColor: '#0A0000', justifyContent: 'center', padding: 30 },
  blacklistHeader: { color: '#FF003C', fontSize: 50, fontWeight: '900', fontStyle: 'italic', textAlign: 'center', marginBottom: 10, textTransform: 'uppercase' },
  blacklistSub: { color: '#FFF', fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 40, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', lineHeight: 22 },
  penaltyBox: { backgroundColor: '#000', borderWidth: 2, borderColor: '#FF003C', padding: 20 },
  penaltyPrompt: { color: '#555', fontSize: 12, fontWeight: 'bold', textAlign: 'center', marginBottom: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  penaltyTargetText: { color: '#00FFFF', fontSize: 18, fontWeight: '900', textAlign: 'center', marginBottom: 20, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  penaltyInput: { backgroundColor: '#111', color: '#FFF', padding: 15, borderWidth: 1, borderColor: '#555', fontSize: 16, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  unlockButton: { backgroundColor: '#FF003C', padding: 15, alignItems: 'center', shadowColor: '#FF003C', shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0 },
  unlockButtonText: { color: '#000', fontWeight: '900', fontSize: 16, letterSpacing: 1 }
});