import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface FileUploadCardProps {
  title?: string;
  subtitle?: string;
  helperText?: string;
  buttonLabel?: string;
  fileName?: string | null;
  onUpload?: () => void;
}

const FileUploadCard = ({
  title = 'Drag and drop or',
  subtitle = 'SVG, PNG, JPG up to 5 MB',
  helperText = 'Tap to upload your file',
  buttonLabel = 'Upload File',
  fileName = null,
  onUpload,
}: FileUploadCardProps) => {
  return (
    <View style={styles.card}>
      <View style={styles.innerCard}>
        <View style={styles.iconWrap}>
          <MaterialCommunityIcons name="cloud-upload-outline" size={26} color="#2E86DE" />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {fileName ? <Text style={styles.fileName}>{fileName}</Text> : null}
        <TouchableOpacity style={styles.button} onPress={onUpload}>
          <MaterialCommunityIcons name="upload" size={16} color="#2E86DE" />
          <Text style={styles.buttonText}>{buttonLabel}</Text>
        </TouchableOpacity>
        <Text style={styles.helperText}>{helperText}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  innerCard: {
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#DCE6F5',
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: '#F7FAFF',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E5F0FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 12,
    color: '#6B7280',
  },
  fileName: {
    marginTop: 10,
    fontSize: 12,
    color: '#1F2937',
    fontWeight: '600',
  },
  button: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7E3F4',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
  },
  helperText: {
    marginTop: 10,
    fontSize: 11,
    color: '#94A3B8',
  },
});

export default FileUploadCard;
