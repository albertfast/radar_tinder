"""
Standalone training script for Vehicle Warning Lights Classifier
This script can be used to train/fine-tune the ResNet50 model on custom data.
"""

import os
import sys
import json
import time
from datetime import datetime
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms
from PIL import Image
import matplotlib.pyplot as plt

# Add parent directory to path for model import
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'model'))
from model_architecture import WarningLightsResNet50


# ============================================================================
# Configuration
# ============================================================================

class TrainingConfig:
    """Centralized training configuration"""
    
    # Paths
    TRAIN_DIR = "path/to/train"          # Update with your dataset path
    VAL_DIR = "path/to/val"              # Update with your dataset path
    TEST_DIR = "path/to/test"            # Update with your dataset path
    OUTPUT_DIR = "./output"
    
    # Training hyperparameters
    BATCH_SIZE = 64
    LEARNING_RATE = 0.001
    NUM_EPOCHS = 100
    EARLY_STOPPING_PATIENCE = 20
    
    # Model parameters
    NUM_CLASSES = 68
    DROPOUT_RATE = 0.3
    USE_PRETRAINED = True  # Use ImageNet pretrained weights
    
    # Augmentation
    IMG_SIZE = 224
    NORMALIZE_MEAN = [0.485, 0.456, 0.406]  # ImageNet stats
    NORMALIZE_STD = [0.229, 0.224, 0.225]
    
    # Device
    DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    
    # Misc
    RANDOM_SEED = 42
    NUM_WORKERS = 4


# ============================================================================
# Dataset
# ============================================================================

class WarningLightsDataset(Dataset):
    """Custom dataset loader for warning light images"""
    
    def __init__(self, root_dir, transform=None):
        """
        Args:
            root_dir (str): Path to dataset directory with class subdirectories
            transform: torchvision transforms to apply
        """
        self.root_dir = root_dir
        self.transform = transform
        self.samples = []
        self.class_to_idx = {}
        
        # Scan directories
        class_names = sorted([d for d in os.listdir(root_dir) 
                            if os.path.isdir(os.path.join(root_dir, d))])
        
        self.class_to_idx = {cls_name: idx for idx, cls_name in enumerate(class_names)}
        self.idx_to_class = {idx: cls_name for cls_name, idx in self.class_to_idx.items()}
        
        # Collect image paths and labels
        for class_name in class_names:
            class_dir = os.path.join(root_dir, class_name)
            class_idx = self.class_to_idx[class_name]
            
            for img_name in os.listdir(class_dir):
                if img_name.lower().endswith(('.png', '.jpg', '.jpeg')):
                    img_path = os.path.join(class_dir, img_name)
                    self.samples.append((img_path, class_idx))
    
    def __len__(self):
        return len(self.samples)
    
    def __getitem__(self, idx):
        img_path, label = self.samples[idx]
        image = Image.open(img_path).convert('RGB')
        
        if self.transform:
            image = self.transform(image)
        
        return image, label


def get_transforms(train=True):
    """Get data transforms for train/test"""
    
    if train:
        return transforms.Compose([
            transforms.Resize((TrainingConfig.IMG_SIZE, TrainingConfig.IMG_SIZE)),
            transforms.RandomHorizontalFlip(p=0.5),
            transforms.RandomRotation(15),
            transforms.ColorJitter(brightness=0.2, contrast=0.2),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=TrainingConfig.NORMALIZE_MEAN,
                std=TrainingConfig.NORMALIZE_STD
            )
        ])
    else:
        return transforms.Compose([
            transforms.Resize((TrainingConfig.IMG_SIZE, TrainingConfig.IMG_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=TrainingConfig.NORMALIZE_MEAN,
                std=TrainingConfig.NORMALIZE_STD
            )
        ])


# ============================================================================
# Training Functions
# ============================================================================

def train_one_epoch(model, dataloader, criterion, optimizer, device):
    """Train for one epoch"""
    model.train()
    running_loss = 0.0
    correct = 0
    total = 0
    
    for images, labels in dataloader:
        images, labels = images.to(device), labels.to(device)
        
        # Forward pass
        optimizer.zero_grad()
        outputs = model(images)
        loss = criterion(outputs, labels)
        
        # Backward pass
        loss.backward()
        optimizer.step()
        
        # Statistics
        running_loss += loss.item() * images.size(0)
        _, predicted = torch.max(outputs, 1)
        total += labels.size(0)
        correct += (predicted == labels).sum().item()
    
    epoch_loss = running_loss / total
    epoch_acc = 100.0 * correct / total
    
    return epoch_loss, epoch_acc


def validate(model, dataloader, criterion, device):
    """Validate model"""
    model.eval()
    running_loss = 0.0
    correct = 0
    total = 0
    
    with torch.no_grad():
        for images, labels in dataloader:
            images, labels = images.to(device), labels.to(device)
            
            outputs = model(images)
            loss = criterion(outputs, labels)
            
            running_loss += loss.item() * images.size(0)
            _, predicted = torch.max(outputs, 1)
            total += labels.size(0)
            correct += (predicted == labels).sum().item()
    
    val_loss = running_loss / total
    val_acc = 100.0 * correct / total
    
    return val_loss, val_acc


def plot_training_curves(history, save_path):
    """Plot and save training curves"""
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))
    
    # Loss
    ax1.plot(history['train_loss'], label='Train Loss', linewidth=2)
    ax1.plot(history['val_loss'], label='Val Loss', linewidth=2)
    ax1.set_xlabel('Epoch', fontsize=12)
    ax1.set_ylabel('Loss', fontsize=12)
    ax1.set_title('Training and Validation Loss', fontsize=14)
    ax1.legend()
    ax1.grid(True, alpha=0.3)
    
    # Accuracy
    ax2.plot(history['train_acc'], label='Train Acc', linewidth=2)
    ax2.plot(history['val_acc'], label='Val Acc', linewidth=2)
    ax2.set_xlabel('Epoch', fontsize=12)
    ax2.set_ylabel('Accuracy (%)', fontsize=12)
    ax2.set_title('Training and Validation Accuracy', fontsize=14)
    ax2.legend()
    ax2.grid(True, alpha=0.3)
    
    plt.tight_layout()
    plt.savefig(save_path, dpi=300, bbox_inches='tight')
    print(f"✅ Training curves saved to {save_path}")


# ============================================================================
# Main Training Loop
# ============================================================================

def main():
    """Main training function"""
    
    # Set random seed
    torch.manual_seed(TrainingConfig.RANDOM_SEED)
    
    # Create output directory
    os.makedirs(TrainingConfig.OUTPUT_DIR, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # Initialize datasets
    print("Loading datasets...")
    train_dataset = WarningLightsDataset(
        TrainingConfig.TRAIN_DIR,
        transform=get_transforms(train=True)
    )
    val_dataset = WarningLightsDataset(
        TrainingConfig.VAL_DIR,
        transform=get_transforms(train=False)
    )
    
    train_loader = DataLoader(
        train_dataset,
        batch_size=TrainingConfig.BATCH_SIZE,
        shuffle=True,
        num_workers=TrainingConfig.NUM_WORKERS,
        pin_memory=True
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=TrainingConfig.BATCH_SIZE,
        shuffle=False,
        num_workers=TrainingConfig.NUM_WORKERS,
        pin_memory=True
    )
    
    print(f"Train samples: {len(train_dataset)}")
    print(f"Val samples: {len(val_dataset)}")
    print(f"Number of classes: {TrainingConfig.NUM_CLASSES}")
    
    # Initialize model
    print("\nInitializing model...")
    model = WarningLightsResNet50(
        num_classes=TrainingConfig.NUM_CLASSES,
        dropout_rate=TrainingConfig.DROPOUT_RATE,
        pretrained=TrainingConfig.USE_PRETRAINED
    )
    model = model.to(TrainingConfig.DEVICE)
    
    params = model.get_num_parameters()
    print(f"Total parameters: {params['total']:,}")
    print(f"Device: {TrainingConfig.DEVICE}")
    
    # Loss and optimizer
    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(model.parameters(), lr=TrainingConfig.LEARNING_RATE)
    
    # Training history
    history = {
        'train_loss': [],
        'train_acc': [],
        'val_loss': [],
        'val_acc': []
    }
    
    # Early stopping
    best_val_acc = 0.0
    patience_counter = 0
    best_epoch = 0
    
    # Training loop
    print(f"\nStarting training for {TrainingConfig.NUM_EPOCHS} epochs...")
    print("=" * 70)
    
    start_time = time.time()
    
    for epoch in range(1, TrainingConfig.NUM_EPOCHS + 1):
        epoch_start = time.time()
        
        # Train
        train_loss, train_acc = train_one_epoch(
            model, train_loader, criterion, optimizer, TrainingConfig.DEVICE
        )
        
        # Validate
        val_loss, val_acc = validate(
            model, val_loader, criterion, TrainingConfig.DEVICE
        )
        
        # Update history
        history['train_loss'].append(train_loss)
        history['train_acc'].append(train_acc)
        history['val_loss'].append(val_loss)
        history['val_acc'].append(val_acc)
        
        epoch_time = time.time() - epoch_start
        
        # Print progress
        print(f"Epoch [{epoch}/{TrainingConfig.NUM_EPOCHS}] ({epoch_time:.1f}s) | "
              f"Train Loss: {train_loss:.4f}, Acc: {train_acc:.2f}% | "
              f"Val Loss: {val_loss:.4f}, Acc: {val_acc:.2f}%")
        
        # Save best model
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_epoch = epoch
            patience_counter = 0
            
            # Save checkpoint
            checkpoint_path = os.path.join(
                TrainingConfig.OUTPUT_DIR,
                f"best_epoch_{epoch}_acc_{val_acc:.2f}.pth"
            )
            torch.save({
                'epoch': epoch,
                'model_state_dict': model.state_dict(),
                'optimizer_state_dict': optimizer.state_dict(),
                'train_acc': train_acc,
                'val_acc': val_acc,
                'train_loss': train_loss,
                'val_loss': val_loss,
            }, checkpoint_path)
            
            print(f"  ✅ New best model saved! Val Acc: {val_acc:.2f}%")
        else:
            patience_counter += 1
        
        # Early stopping
        if patience_counter >= TrainingConfig.EARLY_STOPPING_PATIENCE:
            print(f"\n⚠️ Early stopping triggered after {epoch} epochs")
            print(f"   Best val acc: {best_val_acc:.2f}% at epoch {best_epoch}")
            break
    
    total_time = time.time() - start_time
    print("=" * 70)
    print(f"Training completed in {total_time/60:.2f} minutes")
    print(f"Best validation accuracy: {best_val_acc:.2f}% at epoch {best_epoch}")
    
    # Save training curves
    plot_path = os.path.join(TrainingConfig.OUTPUT_DIR, f"training_curves_{timestamp}.png")
    plot_training_curves(history, plot_path)
    
    # Save training report
    report = {
        'best_epoch': best_epoch,
        'best_val_acc': best_val_acc,
        'total_epochs': epoch,
        'training_time_minutes': total_time / 60,
        'config': {
            'batch_size': TrainingConfig.BATCH_SIZE,
            'learning_rate': TrainingConfig.LEARNING_RATE,
            'num_classes': TrainingConfig.NUM_CLASSES,
            'dropout_rate': TrainingConfig.DROPOUT_RATE,
        },
        'history': history
    }
    
    report_path = os.path.join(TrainingConfig.OUTPUT_DIR, f"training_report_{timestamp}.json")
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)
    
    print(f"✅ Training report saved to {report_path}")


if __name__ == "__main__":
    main()
