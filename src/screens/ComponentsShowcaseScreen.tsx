import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Button, Surface, IconButton } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';

const ComponentsShowcaseScreen = ({ navigation }: any) => {
  return (
    <View style={styles.container}>
      <LinearGradient colors={['#0F172A', '#020617']} style={styles.background} />
      
      <View style={styles.header}>
        <IconButton icon="arrow-left" iconColor="white" onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Design Kit</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Buttons</Text>
        <Surface style={styles.card}>
           <Button mode="contained" style={styles.btn}>Primary Action</Button>
           <Button mode="outlined" style={styles.btn} textColor="white">Secondary Action</Button>
        </Surface>

        <Text style={styles.sectionTitle}>Alerts</Text>
        <Surface style={[styles.card, {backgroundColor: 'rgba(239, 68, 68, 0.2)'}]}>
            <Text style={{color: '#EF4444'}}>Crucial Alert Message</Text>
        </Surface>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617', paddingTop: 40 },
  background: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  title: { fontSize: 24, fontWeight: 'bold', color: 'white' },
  content: { padding: 20 },
  sectionTitle: { color: '#64748B', marginTop: 20, marginBottom: 10, fontWeight: 'bold' },
  card: { padding: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, gap: 10 },
  btn: { marginVertical: 5, borderRadius: 8 }
});

export default ComponentsShowcaseScreen;
