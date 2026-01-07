"""
Vehicle Warning Lights Classifier - Model Architecture
ResNet50 with custom classification head for 68 classes
"""

import torch
import torch.nn as nn
import torchvision.models as models


class WarningLightsResNet50(nn.Module):
    """
    ResNet50-based classifier for 68 vehicle warning light types
    
    Architecture:
        Backbone: ResNet50 (pretrained on ImageNet)
        Classifier Head:
            - Dropout(0.3)
            - Linear(2048 → 512)
            - ReLU
            - BatchNorm1d(512)
            - Dropout(0.15)
            - Linear(512 → 68)
    
    Input Shape: (batch, 3, 224, 224)
    Output Shape: (batch, 68)
    
    Parameters: 24,593,028 total
    """
    
    def __init__(self, num_classes=68, dropout_rate=0.3, pretrained=False):
        """
        Initialize ResNet50 classifier
        
        Args:
            num_classes (int): Number of output classes (default: 68)
            dropout_rate (float): Dropout probability (default: 0.3)
            pretrained (bool): Use ImageNet pretrained weights (default: False)
                             Note: Set to True only during initial training
        """
        super(WarningLightsResNet50, self).__init__()
        
        # Load ResNet50 backbone
        if pretrained:
            self.resnet = models.resnet50(weights='IMAGENET1K_V1')
        else:
            self.resnet = models.resnet50(weights=None)
        
        # Get feature dimension from original classifier
        num_features = self.resnet.fc.in_features  # 2048
        
        # Replace final classifier with custom head
        self.resnet.fc = nn.Sequential(
            # First dropout for regularization
            nn.Dropout(p=dropout_rate),
            
            # Reduce dimensions: 2048 → 512
            nn.Linear(num_features, 512),
            nn.ReLU(inplace=True),
            
            # Batch normalization for stability
            nn.BatchNorm1d(512),
            
            # Second dropout (lower rate)
            nn.Dropout(p=dropout_rate / 2),
            
            # Final classification layer: 512 → num_classes
            nn.Linear(512, num_classes)
        )
    
    def forward(self, x):
        """
        Forward pass
        
        Args:
            x (torch.Tensor): Input tensor of shape (batch, 3, 224, 224)
        
        Returns:
            torch.Tensor: Output logits of shape (batch, num_classes)
        """
        return self.resnet(x)
    
    def get_num_parameters(self):
        """Count total and trainable parameters"""
        total_params = sum(p.numel() for p in self.parameters())
        trainable_params = sum(p.numel() for p in self.parameters() if p.requires_grad)
        return {
            'total': total_params,
            'trainable': trainable_params,
            'frozen': total_params - trainable_params
        }


# Compatibility alias
ResNet50Classifier = WarningLightsResNet50


def create_model(num_classes=68, pretrained=False, checkpoint_path=None):
    """
    Factory function to create and optionally load a model
    
    Args:
        num_classes (int): Number of classes
        pretrained (bool): Use ImageNet pretrained weights for backbone
        checkpoint_path (str): Path to checkpoint file (.pth)
    
    Returns:
        WarningLightsResNet50: Model instance
    
    Example:
        # Create new model
        model = create_model(num_classes=68, pretrained=True)
        
        # Load trained model
        model = create_model(checkpoint_path="best_epoch_57_acc_96.58.pth")
    """
    model = WarningLightsResNet50(
        num_classes=num_classes,
        dropout_rate=0.3,
        pretrained=pretrained
    )
    
    if checkpoint_path:
        checkpoint = torch.load(checkpoint_path, map_location='cpu')
        model.load_state_dict(checkpoint['model_state_dict'])
        print(f"✅ Loaded checkpoint from epoch {checkpoint.get('epoch', '?')}")
        print(f"   Validation accuracy: {checkpoint.get('val_acc', '?'):.2f}%")
    
    return model


if __name__ == "__main__":
    # Demo: Create model and print architecture
    print("="*70)
    print("Vehicle Warning Lights ResNet50 - Model Architecture")
    print("="*70)
    
    model = WarningLightsResNet50(num_classes=68, dropout_rate=0.3)
    model.eval()  # Set to evaluation mode
    
    # Print parameter count
    params = model.get_num_parameters()
    print(f"\nTotal parameters: {params['total']:,}")
    print(f"Trainable parameters: {params['trainable']:,}")
    
    # Print architecture
    print("\nModel Architecture:")
    print(model)
    
    # Test forward pass
    print("\nTesting forward pass...")
    dummy_input = torch.randn(1, 3, 224, 224)
    with torch.no_grad():
        output = model(dummy_input)
    print(f"Input shape: {dummy_input.shape}")
    print(f"Output shape: {output.shape}")
    
    # Expected output shape
    assert output.shape == (1, 68), f"Expected (1, 68), got {output.shape}"
    print("✅ Forward pass successful!")
